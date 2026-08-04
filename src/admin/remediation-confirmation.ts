import { createHash } from "node:crypto";

export function sortedIdDigest(ids: readonly string[]) {
  return createHash("sha256")
    .update([...ids].map((id) => id.toLowerCase()).sort().join("\n"))
    .digest("hex");
}

export function stableObjectDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
