import { z } from "zod";

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}, z.string().min(1).optional());

const optionalEmail = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}, z.string().email().optional());

const optionalEncryptionKey = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}, z.string().optional());

const optionalSheetPrivateKey = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().replaceAll("\\n", "\n");
  return normalized.length === 0 ? undefined : normalized;
}, z.string().optional());

const timezone = z
  .string()
  .trim()
  .min(1)
  .default("Africa/Cairo")
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "GOOGLE_TRANSFERS_SHEET_TIMEZONE must be a valid IANA timezone.");

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    APP_URL: z.string().url().default("http://localhost:3000"),
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM_NAME: z.string().trim().min(1).default("DialExpert"),
    EMAIL_FROM_ADDRESS: z
      .string()
      .email()
      .default("no-reply@updates.dialexpert.com"),
    EMAIL_REPLY_TO: optionalEmail,
    RESEND_API_KEY: optionalTrimmedString,
    INVITATION_TTL_HOURS: z.coerce.number().positive().default(48),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().positive().default(30),
    TEMP_PASSWORD_ENCRYPTION_KEY: optionalEncryptionKey,
    GOOGLE_TRANSFERS_SHEET_ID: optionalTrimmedString,
    GOOGLE_TRANSFERS_SHEET_GID: optionalTrimmedString,
    GOOGLE_TRANSFERS_SHEET_RANGE: optionalTrimmedString,
    GOOGLE_TRANSFERS_SHEET_TIMEZONE: timezone,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalEmail,
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: optionalSheetPrivateKey,
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER === "console" && env.NODE_ENV === "production") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_PROVIDER"],
        message: "EMAIL_PROVIDER=console is not allowed in production.",
      });
    }

    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when EMAIL_PROVIDER=resend.",
      });
    }

    if (env.EMAIL_PROVIDER === "resend" && !env.EMAIL_FROM_ADDRESS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_FROM_ADDRESS"],
        message: "EMAIL_FROM_ADDRESS is required when EMAIL_PROVIDER=resend.",
      });
    }

    if (
      env.TEMP_PASSWORD_ENCRYPTION_KEY &&
      !isValidEncryptionKey(env.TEMP_PASSWORD_ENCRYPTION_KEY)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TEMP_PASSWORD_ENCRYPTION_KEY"],
        message:
          "TEMP_PASSWORD_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
      });
    }

    if (env.NODE_ENV === "production" && !env.TEMP_PASSWORD_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TEMP_PASSWORD_ENCRYPTION_KEY"],
        message: "TEMP_PASSWORD_ENCRYPTION_KEY is required in production.",
      });
    }

    if (
      Boolean(env.GOOGLE_TRANSFERS_SHEET_ID) !==
      Boolean(env.GOOGLE_TRANSFERS_SHEET_GID)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_TRANSFERS_SHEET_ID"],
        message:
          "GOOGLE_TRANSFERS_SHEET_ID and GOOGLE_TRANSFERS_SHEET_GID must be configured together.",
      });
    }

    if (
      Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL) !==
      Boolean(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_SERVICE_ACCOUNT_EMAIL"],
        message:
          "Google service-account email and private key must be configured together.",
      });
    }

    if (
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      env.GOOGLE_TRANSFERS_SHEET_ID &&
      !env.GOOGLE_TRANSFERS_SHEET_RANGE
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_TRANSFERS_SHEET_RANGE"],
        message:
          "GOOGLE_TRANSFERS_SHEET_RANGE is required for authenticated Google Sheets access.",
      });
    }
  });

function isValidEncryptionKey(value: string) {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.parse(source);
}

export function validateEnv() {
  cachedEnv = parseEnv(process.env);
  return cachedEnv;
}

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }

  return cachedEnv;
}

export function resetEnvForTests() {
  cachedEnv = null;
}
