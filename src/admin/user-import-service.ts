import "server-only";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";

import { createAdminUser } from "@/admin/data";
import { roleRequiresTeam } from "@/admin/policy";
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
import { actorOrganizationId, visibleTeamWhere } from "@/teams/visibility";

const PREVIEW_TTL_MS = 30 * 60 * 1000;

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw new Error("Forbidden");
}

async function validationContext(actor: Actor) {
  const [emailRows, dialerRows, teamRows] = await Promise.all([
    getDb()
      .select({ email: profiles.email })
      .from(profiles)
      .where(eq(profiles.organizationId, actorOrganizationId(actor))),
    getDb()
      .select({ name: sourceUserMappings.normalizedAgentName })
      .from(sourceUserMappings)
      .innerJoin(profiles, eq(profiles.id, sourceUserMappings.profileId))
      .where(
        and(
          eq(sourceUserMappings.active, true),
          eq(profiles.organizationId, actorOrganizationId(actor)),
        ),
      ),
    getDb()
      .select({ id: teams.id, name: teams.name, active: teams.active })
      .from(teams)
      .where(visibleTeamWhere(actor)),
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

  const context = await validationContext(input.actor);
  const preview = parseUserImportCsv({ content: input.content, ...context });
  if (preview.fatalErrors.length > 0) {
    return { batchId: null, preview };
  }

  const batchId = newId();
  await getDb().insert(userImportBatches).values({
    id: batchId,
    organizationId: actorOrganizationId(input.actor),
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
  const confirmationHash = createHash("sha256")
    .update(
      JSON.stringify(
        [...input.assignments]
          .sort((left, right) => left.rowNumber - right.rowNumber)
          .map(({ rowNumber, selected, role, teamId }) => ({
            rowNumber,
            selected,
            role,
            teamId,
          })),
      ),
    )
    .digest("hex");
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);

  const claimed = await getDb().transaction(async (tx) => {
    const batchRows = await tx
      .select()
      .from(userImportBatches)
      .where(
        and(
          eq(userImportBatches.id, input.batchId),
          eq(userImportBatches.organizationId, actorOrganizationId(input.actor)),
          eq(userImportBatches.uploadedById, input.actor.id),
        ),
      )
      .limit(1)
      .for("update");
    const batch = batchRows[0];
    if (!batch) return null;
    if (batch.status === "confirmed") {
      return batch.confirmationHash === confirmationHash
        ? { batch, replay: true as const }
        : null;
    }
    const recoverable =
      batch.status === "processing" &&
      batch.confirmationHash === confirmationHash &&
      Boolean(batch.processingStartedAt && batch.processingStartedAt < staleBefore);
    if (
      batch.expiresAt <= now ||
      (batch.status !== "previewed" && !recoverable)
    ) {
      return null;
    }
    await tx
      .update(userImportBatches)
      .set({
        status: "processing",
        processingStartedAt: now,
        confirmationHash,
        resultSummary: batch.resultSummary ?? { outcomes: [] },
      })
      .where(eq(userImportBatches.id, batch.id));
    return { batch, replay: false as const };
  });
  if (!claimed) throw new Error("This import preview is invalid, busy, or expired.");
  const batch = claimed.batch;

  const context = await validationContext(input.actor);
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
  const existingOutcomes = new Map(
    (batch.resultSummary?.outcomes ?? []).map((outcome) => [outcome.rowNumber, outcome]),
  );

  if (claimed.replay) {
    const replayOutcomes = Array.from(existingOutcomes.values()).sort(
      (left, right) => left.rowNumber - right.rowNumber,
    );
    return {
      preview,
      outcomes: replayOutcomes,
      summary: {
        created: replayOutcomes.filter((outcome) => outcome.status === "created").length,
        skipped: replayOutcomes.filter((outcome) => outcome.status === "skipped").length,
        failed: replayOutcomes.filter((outcome) => outcome.status === "failed").length,
      },
    };
  }

  async function checkpoint(outcome: (typeof outcomes)[number]) {
    existingOutcomes.set(outcome.rowNumber, outcome);
    await getDb()
      .update(userImportBatches)
      .set({ resultSummary: { outcomes: Array.from(existingOutcomes.values()) } })
      .where(
        and(
          eq(userImportBatches.id, batch.id),
          eq(userImportBatches.status, "processing"),
          eq(userImportBatches.confirmationHash, confirmationHash),
        ),
      );
  }

  for (const row of preview.rows) {
    const previousOutcome = existingOutcomes.get(row.rowNumber);
    if (previousOutcome) {
      outcomes.push(previousOutcome);
      continue;
    }
    const assignment = assignmentByRow.get(row.rowNumber);
    if (!assignment?.selected) {
      const outcome = {
        rowNumber: row.rowNumber,
        status: "skipped" as const,
        reason: "Not selected for import.",
      };
      outcomes.push(outcome);
      await checkpoint(outcome);
      continue;
    }
    if (!row.validForAssignment) {
      const outcome = {
        rowNumber: row.rowNumber,
        status: "skipped" as const,
        reason: row.errors.join(" "),
      };
      outcomes.push(outcome);
      await checkpoint(outcome);
      continue;
    }
    if (
      !assignment.role ||
      (roleRequiresTeam(assignment.role) && !assignment.teamId)
    ) {
      const outcome = {
        rowNumber: row.rowNumber,
        status: "skipped" as const,
        reason: "Assign a valid role and, when required, an active team before import.",
      };
      outcomes.push(outcome);
      await checkpoint(outcome);
      continue;
    }
    if (assignment.teamId && !activeTeams.has(assignment.teamId)) {
      const outcome = {
        rowNumber: row.rowNumber,
        status: "skipped" as const,
        reason: "The selected team is inactive or no longer exists.",
      };
      outcomes.push(outcome);
      await checkpoint(outcome);
      continue;
    }

    try {
      const created = await createAdminUser(input.actor, {
        name: row.realName,
        dialerName: row.americanName,
        dialerAliases: [],
        shift: row.shift,
        email: row.email,
        role: assignment.role,
        teamId: assignment.teamId ?? undefined,
        permissionOverrides: [],
        importBatchId: batch.id,
      });
      const outcome = {
        rowNumber: row.rowNumber,
        userId: created.profileId,
        status: "created" as const,
      };
      outcomes.push(outcome);
      await checkpoint(outcome);
    } catch {
      const [recovered] = await getDb()
        .select({ id: profiles.id })
        .from(profiles)
        .innerJoin(auditLogs, eq(auditLogs.entityId, profiles.id))
        .where(
          and(
            eq(profiles.organizationId, actorOrganizationId(input.actor)),
            eq(profiles.email, row.email),
            eq(auditLogs.action, "user.imported"),
            sql`json_unquote(json_extract(${auditLogs.metadata}, '$.after.importBatchId')) = ${batch.id}`,
          ),
        )
        .limit(1);
      const outcome = recovered
        ? { rowNumber: row.rowNumber, userId: recovered.id, status: "created" as const }
        : {
            rowNumber: row.rowNumber,
            status: "failed" as const,
            reason: "The user could not be created.",
          };
      outcomes.push(outcome);
      await checkpoint(outcome);
    }
  }

  const created = outcomes.filter((outcome) => outcome.status === "created").length;
  const skipped = outcomes.filter((outcome) => outcome.status === "skipped").length;
  const failed = outcomes.filter((outcome) => outcome.status === "failed").length;

  await getDb().transaction(async (tx) => {
    await tx
      .update(userImportBatches)
      .set({
        status: "confirmed",
        confirmedAt: now,
        processingStartedAt: null,
        resultSummary: { outcomes },
      })
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
