import type { AdminTeamDirectoryRow } from "@/admin/teams";

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function adminTeamsCsv(rows: readonly AdminTeamDirectoryRow[]) {
  const header = ["Team", "Status", "Manager", "Member count", "Agent count", "Created date"];
  const body = rows.map((row) => [
    row.name,
    row.active ? "Active" : "Inactive",
    row.managers.length ? row.managers.map((manager) => manager.name).join("; ") : "Unassigned",
    row.memberCount,
    row.agentCount,
    row.createdAt.toISOString(),
  ]);
  return [header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
