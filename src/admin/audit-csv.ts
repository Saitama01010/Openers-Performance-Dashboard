import type { AuditCategory } from "@/admin/audit-format";

type AuditCsvRow = {
  id: string;
  createdAt: Date | string;
  actor: { name: string; role: string };
  title: string;
  action: string;
  target: { label: string; typeLabel: string };
  category: AuditCategory;
  categoryLabel: string;
  description: string;
};

function neutralize(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: unknown) {
  return `"${neutralize(value).replaceAll('"', '""')}"`;
}

export function adminAuditCsv(rows: AuditCsvRow[]) {
  const headers = ["Event ID", "Timestamp", "Actor", "Actor role", "Action", "Action key", "Target", "Target type", "Category", "Description"];
  return [
    headers.map(cell).join(","),
    ...rows.map((row) => [row.id, new Date(row.createdAt).toISOString(), row.actor.name, row.actor.role, row.title, row.action, row.target.label, row.target.typeLabel, row.categoryLabel, row.description].map(cell).join(",")),
  ].join("\r\n");
}
