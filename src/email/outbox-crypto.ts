import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { getEnv } from "@/env";

function key() {
  const env = getEnv();
  if (env.OUTBOX_ENCRYPTION_KEY) {
    return Buffer.from(env.OUTBOX_ENCRYPTION_KEY, "base64");
  }
  // Production validation requires a dedicated key. Derivation keeps local
  // development and isolated tests usable without adding another secret.
  return createHash("sha256").update(env.SESSION_SECRET).digest();
}

export function encryptOutboxPayload(payload: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptOutboxPayload(value: string) {
  const [version, encodedIv, encodedTag, encodedPayload, extra] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedPayload || extra) {
    throw new Error("Queued email payload has an invalid envelope.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedPayload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed: unknown = JSON.parse(plaintext);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Queued email payload is invalid.");
  }
  return parsed as Record<string, unknown>;
}
