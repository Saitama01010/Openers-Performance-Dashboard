import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import type { Actor } from "@/auth/authorization";
import { getDb } from "@/db";
import {
  dialerDatasetScopes,
  dialerDatasetVersions,
  dialerImportBatches,
  profiles,
} from "@/db/schema";
import { listImportHistory } from "@/import/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];
const batchIds: string[] = [];
const scopeKeys: string[] = [];

async function createActor(role: "admin" | "manager" | "agent", name: string) {
  const id = newId();
  profileIds.push(id);
  await getDb().insert(profiles).values({
    id,
    email: `${id}@history-list.example.test`,
    name,
    role,
    active: true,
    accountStatus: "active",
    passwordHash: "test-hash",
  });
  return { id, role, teamIds: [] } satisfies Actor;
}

async function createBatch(input: {
  uploader: Actor;
  fileName: string;
  status:
    | "active"
    | "superseded"
    | "failed"
    | "validation_failed"
    | "draft";
  createdAt: Date;
  publishedAt?: Date;
  active?: boolean;
  previewSummary?: Record<string, unknown> | null;
}) {
  const id = newId();
  batchIds.push(id);
  const rawFileContent = "Agent,Date\nHistory Agent,2099-06-01\n";
  await getDb().insert(dialerImportBatches).values({
    id,
    source: "dialer",
    importType: "agent_hours_performance",
    granularity: "daily",
    fileName: input.fileName,
    fileHash: id.replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    fileSizeBytes: Buffer.byteLength(rawFileContent),
    storageProvider: "database",
    storageLocation: `database://dialer_import_batches/${id}/raw_file_content`,
    status: input.status,
    uploadedById: input.uploader.id,
    rawFileContent,
    rowCount: 125,
    matchedAgentCount: 10,
    unmatchedAgentCount: 2,
    reportingStartDate: "2099-06-01",
    reportingEndDate: "2099-06-01",
    previewSummary: input.previewSummary ?? null,
    publishedAt: input.publishedAt,
    createdAt: input.createdAt,
  });

  if (input.active) {
    const versionId = newId();
    const scopeKey = `dialer|agent_hours_performance|2099-06-01|company|${id}`;
    scopeKeys.push(scopeKey);
    await getDb().insert(dialerDatasetVersions).values({
      id: versionId,
      importBatchId: id,
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      granularity: "daily",
      reportingDate: "2099-06-01",
      versionNumber: 1,
      status: "active",
      rowCount: 123,
      matchedAgentCount: 10,
      totalCalls: 500,
    });
    await getDb().insert(dialerDatasetScopes).values({
      scopeKey,
      source: "dialer",
      importType: "agent_hours_performance",
      reportingDate: "2099-06-01",
      activeVersionId: versionId,
      revision: 1,
    });
  }

  return id;
}

afterEach(async () => {
  if (scopeKeys.length > 0) {
    await getDb()
      .update(dialerDatasetScopes)
      .set({ activeVersionId: null })
      .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys));
  }
  if (batchIds.length > 0) {
    await getDb()
      .delete(dialerDatasetVersions)
      .where(inArray(dialerDatasetVersions.importBatchId, batchIds));
    await getDb()
      .delete(dialerImportBatches)
      .where(inArray(dialerImportBatches.id, batchIds));
  }
  if (scopeKeys.length > 0) {
    await getDb()
      .delete(dialerDatasetScopes)
      .where(inArray(dialerDatasetScopes.scopeKey, scopeKeys));
  }
  if (profileIds.length > 0) {
    await getDb().delete(profiles).where(inArray(profiles.id, profileIds));
  }
  batchIds.splice(0);
  profileIds.splice(0);
  scopeKeys.splice(0);
});

describe("Import History list", () => {
  it("authorizes administrators and returns truthful summary and row metadata", async () => {
    const admin = await createActor("admin", "History Admin");
    const secondAdmin = await createActor("admin", "Second History Admin");
    const now = new Date();
    await createBatch({
      uploader: admin,
      fileName: "active-hours.csv",
      status: "active",
      active: true,
      createdAt: new Date(now.getTime() - 1_000),
      publishedAt: new Date(now.getTime() - 500),
      previewSummary: {
        duplicateFile: false,
        invalidRows: 3,
        mappedRowsToImport: 120,
        outOfScopeRowsToSkip: 1,
        unchangedRows: 0,
        unmappedRowsToSkip: 1,
      },
    });
    await createBatch({
      uploader: admin,
      fileName: "published-hours.csv",
      status: "superseded",
      createdAt: new Date(now.getTime() - 2_000),
      publishedAt: new Date(now.getTime() - 1_500),
    });
    await createBatch({
      uploader: secondAdmin,
      fileName: "failed-hours.csv",
      status: "failed",
      createdAt: new Date(now.getTime() - 3_000),
    });
    await createBatch({
      uploader: admin,
      fileName: "validation-failed-hours.csv",
      status: "validation_failed",
      createdAt: new Date(now.getTime() - 4_000),
    });
    await createBatch({
      uploader: admin,
      fileName: "draft-hours.csv",
      status: "draft",
      createdAt: new Date(now.getTime() - 5_000),
    });

    const history = await listImportHistory(admin, { pageSize: 10 });

    expect(history.summary).toMatchObject({
      active: 1,
      drafts: 1,
      failed: 2,
      published: 2,
      total: 5,
    });
    expect(history.facets.statuses).toEqual(
      expect.arrayContaining(["active", "draft", "failed", "superseded"]),
    );
    expect(history.facets.importTypes).toContain("agent_hours_performance");
    expect(history.facets.uploaders).toEqual(
      expect.arrayContaining([
        { id: admin.id, name: "History Admin" },
        { id: secondAdmin.id, name: "Second History Admin" },
      ]),
    );
    expect(history.rows.find((row) => row.fileName === "active-hours.csv")).toMatchObject({
      activeVersionCount: 1,
      duplicateFile: false,
      invalidRowCount: 3,
      mappedRowCount: 120,
      unauthorizedRowCount: 1,
      unmatchedRowCount: 1,
    });
  });

  it("filters, searches, sorts, and paginates on the server", async () => {
    const admin = await createActor("admin", "Searchable Admin");
    const otherAdmin = await createActor("admin", "Uploader Filter Admin");
    const now = new Date();
    const alphaId = await createBatch({ uploader: admin, fileName: "alpha.csv", status: "draft", createdAt: now });
    await createBatch({ uploader: otherAdmin, fileName: "beta.csv", status: "failed", createdAt: new Date(now.getTime() - 1_000) });
    await createBatch({ uploader: admin, fileName: "gamma.csv", status: "draft", createdAt: new Date("2024-01-01T00:00:00Z") });

    expect((await listImportHistory(admin, { search: "alpha" })).rows.map((row) => row.id)).toEqual([alphaId]);
    expect((await listImportHistory(admin, { search: alphaId })).rows).toHaveLength(1);
    expect((await listImportHistory(admin, { search: "Uploader Filter" })).rows.map((row) => row.fileName)).toEqual(["beta.csv"]);
    expect((await listImportHistory(admin, { status: "failed" })).rows.map((row) => row.fileName)).toEqual(["beta.csv"]);
    expect((await listImportHistory(admin, { importType: "agent_hours_performance" })).rows).toHaveLength(3);
    expect((await listImportHistory(admin, { uploadedById: otherAdmin.id })).rows.map((row) => row.fileName)).toEqual(["beta.csv"]);
    expect((await listImportHistory(admin, { dateRange: "7d" })).rows.map((row) => row.fileName).sort()).toEqual(["alpha.csv", "beta.csv"]);

    const page = await listImportHistory(admin, {
      order: "asc",
      page: 2,
      pageSize: 1,
      sort: "fileName",
    });
    expect(page.total).toBe(3);
    expect(page.rows.map((row) => row.fileName)).toEqual(["beta.csv"]);
  });

  it("fails closed for managers and agents", async () => {
    const admin = await createActor("admin", "History Admin");
    const manager = await createActor("manager", "History Manager");
    const agent = await createActor("agent", "History Agent");
    await createBatch({ uploader: admin, fileName: "private.csv", status: "draft", createdAt: new Date() });

    await expect(listImportHistory(manager)).rejects.toMatchObject({ code: "forbidden" });
    await expect(listImportHistory(agent)).rejects.toMatchObject({ code: "forbidden" });
  });
});
