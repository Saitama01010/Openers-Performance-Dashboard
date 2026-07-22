"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/auth/session";
import { getDb } from "@/db";
import {
  dialerAgentHourlyMetrics,
  dialerImportBatches,
  sourceUserMappings,
  teamMemberships,
} from "@/db/schema";
import { previewDialerCsv } from "@/import/dialer";

export async function previewImportAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role === "agent") {
    redirect("/login");
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    redirect("/import?error=file");
  }

  const content = await file.text();
  const [hashRows, mappingsRows, metricRows] = await Promise.all([
    getDb()
      .select({ fileHash: dialerImportBatches.fileHash })
      .from(dialerImportBatches)
      .where(eq(dialerImportBatches.source, "dialer")),
    getDb()
      .select({
        sourceAgentName: sourceUserMappings.sourceAgentName,
        profileId: sourceUserMappings.profileId,
        teamId: teamMemberships.teamId,
      })
      .from(sourceUserMappings)
      .innerJoin(
        teamMemberships,
        eq(teamMemberships.profileId, sourceUserMappings.profileId),
      )
      .where(eq(sourceUserMappings.source, "dialer")),
    getDb()
      .select({
        source: dialerAgentHourlyMetrics.source,
        agentProfileId: dialerAgentHourlyMetrics.agentProfileId,
        metricDate: dialerAgentHourlyMetrics.metricDate,
        metricHour: dialerAgentHourlyMetrics.metricHour,
        rowHash: dialerAgentHourlyMetrics.rowHash,
      })
      .from(dialerAgentHourlyMetrics),
  ]);
  const mappingByAgent = new Map<
    string,
    { sourceAgentName: string; profileId: string; teamIds: string[] }
  >();

  for (const mapping of mappingsRows) {
    const current = mappingByAgent.get(mapping.sourceAgentName) ?? {
      sourceAgentName: mapping.sourceAgentName,
      profileId: mapping.profileId,
      teamIds: [],
    };
    current.teamIds.push(mapping.teamId);
    mappingByAgent.set(mapping.sourceAgentName, current);
  }

  const preview = previewDialerCsv({
    source: "dialer",
    fileContent: content,
    existingFileHashes: new Set(hashRows.map((row) => row.fileHash)),
    mappings: Array.from(mappingByAgent.values()),
    existingMetrics: metricRows.map((row) => ({
      ...row,
      metricDate: String(row.metricDate),
    })),
    actor: user,
  });

  const encoded = encodeURIComponent(JSON.stringify(preview.summary));
  redirect(
    `/import?hash=${preview.fileHash}&duplicate=${preview.duplicateFile}&summary=${encoded}`,
  );
}
