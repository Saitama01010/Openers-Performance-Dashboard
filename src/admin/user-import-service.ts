import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";

import { createAdminUser } from "@/admin/data";
import {
  MAX_USER_CSV_BYTES,
  parseUserImportCsv,
  type ImportRole,
} from "@/admin/user-import-csv";
import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  auditLogs,
  profiles,
  sourceUserMappings,
  teams,
  userImportBatches,
} from "@/db/schema";
import { newId } from "@/lib/ids";

const PREVIEW_TTL_MS = 30 * 60 * 1000;

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Forbidden");
}

async function validationContext() {
  const [emailRows, dialerRows, teamRows] = await Promise.all([
    getDb().select({ email: profiles.email }).from(profiles),
    getDb()
      .select({ name: sourceUserMappings.normalizedAgentName })
      .from(sourceUserMappings)
      .where(eq(sourceUserMappings.active, true)),
    getDb()
      .select({ id: teams.id, name: teams.name, active: teams.active })
      .from(teams),
  ]);

  return {
    existingEmails: emailRows.flatMap((row) => (row.email ? [row.email] : [])),
    existingDialerNames: dialerRows.map((row) => row.name),
    teams: teamRows,
  };
}

export async function createUserImportPreview(input: {
  actor: Actor;
  fileName: string;
  content: string;
}) {
  assertAdmin(input.actor);
  if (
    !input.fileName.toLowerCase().endsWith(".csv") ||
    input.fileName.length > 255 ||
    Buffer.byteLength(input.content, "utf8") === 0 ||
    Buffer.byteLength(input.content, "utf8") > MAX_USER_CSV_BYTES
  ) {
    throw new Error("Choose a CSV file no larger than 1 MB.");
  }

  const context = await validationContext();
  const preview = parseUserImportCsv({ content: input.content, ...context });
  if (preview.fatalErrors.length > 0) {
    return { batchId: null, preview };
  }

  const batchId = newId();
  await getDb().insert(userImportBatches).values({
    id: batchId,
    fileName: input.fileName,
    fileHash: createHash("sha256").update(input.content).digest("hex"),
    uploadedById: input.actor.id,
    rawFileContent: input.content,
    rowCount: preview.rows.length,
    expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
  });

  return { batchId, preview };
}

export type UserImportAssignment = {
  rowNumber: number;
  selected: boolean;
  role: ImportRole | null;
  teamId: string | null;
};

export async function confirmUserImport(input: {
  actor: Actor;
  batchId: string;
  assignments: UserImportAssignment[];
}) {
  assertAdmin(input.actor);
  const now = new Date();
  if (
    input.assignments.length === 0 ||
    !input.assignments.some((assignment) => assignment.selected) ||
    input.assignments.length > 500
  ) {
    throw new Error("Select between 1 and 500 users to import.");
  }
  const assignmentByRow = new Map<number, UserImportAssignment>();
  for (const assignment of input.assignments) {
    if (assignmentByRow.has(assignment.rowNumber)) {
      throw new Error("Duplicate row assignment.");
    }
    assignmentByRow.set(assignment.rowNumber, assignment);
  }

  const batch = await getDb().transaction(async (tx) => {
    const batchRows = await tx
      .select()
      .from(userImportBatches)
      .where(
        and(
          eq(userImportBatches.id, input.batchId),
          eq(userImportBatches.uploadedById, input.actor.id),
          eq(userImportBatches.status, "previewed"),
          gt(userImportBatches.expiresAt, now),
        ),
      )
      .limit(1)
      .for("update");
    const claimed = batchRows[0];
    if (!claimed) return null;
    await tx
      .update(userImportBatches)
      .set({ status: "processing" })
      .where(eq(userImportBatches.id, claimed.id));
    return claimed;
  });
  if (!batch) throw new Error("This import preview is invalid or expired.");

  const context = await validationContext();
  const preview = parseUserImportCsv({
    content: batch.rawFileContent,
    ...context,
  });
  if (preview.fatalErrors.length > 0) {
    await getDb()
      .update(userImportBatches)
      .set({ status: "previewed" })
      .where(eq(userImportBatches.id, batch.id));
    throw new Error("The stored CSV no longer passes validation.");
  }

  const activeTeams = new Set(
    context.teams.filter((team) => team.active).map((team) => team.id),
  );
  const outcomes: {
    rowNumber: number;
    userId?: string;
    status: "created" | "skipped" | "failed";
    reason?: string;
  }[] = [];

  for (const row of preview.rows) {
    const assignment = assignmentByRow.get(row.rowNumber);
    if (!assignment?.selected) {
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "skipped",
        reason: "Not selected for import.",
      });
      continue;
    }
    if (!row.validForAssignment) {
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "skipped",
        reason: row.errors.join(" "),
      });
      continue;
    }
    if (!assignment.role || !assignment.teamId) {
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "skipped",
        reason: "Assign a valid role and active team before import.",
      });
      continue;
    }
    if (!activeTeams.has(assignment.teamId)) {
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "skipped",
        reason: "The selected team is inactive or no longer exists.",
      });
      continue;
    }

    try {
      const created = await createAdminUser(input.actor, {
        name: row.username,
        dialerName: row.dialerName,
        dialerAliases: [],
        email: row.email,
        role: assignment.role,
        teamId: assignment.teamId,
        permissionOverrides: [],
        importBatchId: batch.id,
      });
      outcomes.push({
        rowNumber: row.rowNumber,
        userId: created.profileId,
        status: "created",
      });
    } catch (error) {
      outcomes.push({
        rowNumber: row.rowNumber,
        status: "failed",
        reason:
          error instanceof Error ? error.message : "User creation failed.",
      });
    }
  }

  const created = outcomes.filter((outcome) => outcome.status === "created").length;
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;

  await getDb().transaction(async (tx) => {
    await tx
      .update(userImportBatches)
      .set({ status: "confirmed", confirmedAt: now })
      .where(eq(userImportBatches.id, batch.id));
    await tx.insert(auditLogs).values({
      id: newId(),
      actorProfileId: input.actor.id,
      action: "user.bulk_import_completed",
      entityType: "user_import_batch",
      entityId: batch.id,
      metadata: {
        batchId: batch.id,
        fileName: batch.fileName,
        selected: input.assignments.filter((assignment) => assignment.selected)
          .length,
        successful: created,
        skipped,
        failed,
      },
    });
  });

  return { preview, outcomes, summary: { created, skipped, failed } };
}
