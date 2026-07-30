import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

function encryptionKey() {
  const configured = process.env.TEMP_PASSWORD_ENCRYPTION_KEY;

  if (!configured) {
    throw new Error(
      "Temporary-password encryption is not configured. Set TEMP_PASSWORD_ENCRYPTION_KEY.",
    );
  }

  const key = Buffer.from(configured, "base64");
  if (key.length !== 32 || key.toString("base64") !== configured) {
    throw new Error("Temporary-password encryption configuration is invalid.");
  }

  return key;
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

export function generateTemporaryPassword(length = 20) {
  if (length < 16) {
    throw new Error("Temporary passwords must be at least 16 characters.");
  }

  const bytes = randomBytes(length);
  const generated = Array.from(
    bytes,
    (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length],
  );

  generated[0] = "A";
  generated[1] = "a";
  generated[2] = "7";
  generated[3] = "!";
  return generated.join("");
}

export function encryptTemporaryPassword(password: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(password, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [VERSION, encode(iv), encode(tag), encode(ciphertext)].join(".");
}

export function decryptTemporaryPassword(payload: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded, extra] =
    payload.split(".");

  if (
    version !== VERSION ||
    !ivEncoded ||
    !tagEncoded ||
    !ciphertextEncoded ||
    extra
  ) {
    throw new Error("Temporary password is unavailable.");
  }

  try {
    const iv = decode(ivEncoded);
    const tag = decode(tagEncoded);
    const ciphertext = decode(ciphertextEncoded);
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid payload");
    }

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Temporary password is unavailable.");
  }
}
