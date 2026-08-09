import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().trim().email().max(255);
export const reasonSchema = z.string().trim().min(5).max(1_000);
export const pageSchema = z.coerce.number().int().min(1).max(10_000);
export const pageSizeSchema = z.coerce.number().int().min(1).max(100);

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes = 64 * 1024,
): Promise<z.output<T>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") throw new Error("Invalid JSON body.");
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Request body is too large.");
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error("Request body is too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body.");
  }
  return schema.parse(parsed);
}

export function assertFormBodySize(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error("Request body is too large.");
  }
}
