import { z } from "zod";
import { testDatabaseSafetyError } from "@/db/safety";

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

const boundedInteger = (defaultValue: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(defaultValue);

const optionalAppsScriptUrl = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}, z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "script.google.com" &&
      /^\/macros\/s\/[^/]+\/exec$/.test(url.pathname)
    );
  }, "GOOGLE_TRANSFERS_APPS_SCRIPT_URL must be an HTTPS Google Apps Script /exec URL.")
  .optional());

const canonicalAppUrl = z.string().url().default("http://localhost:3000").refine(
  (value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      value === url.origin
    );
  },
  "APP_URL must be a canonical origin without credentials, path, query, hash, or trailing slash.",
);

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
  }, "GOOGLE_SHEETS_TIMEZONE must be a valid IANA timezone.");

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_CONNECTION_LIMIT: boundedInteger(10, 2, 50),
    DATABASE_POOL_QUEUE_LIMIT: boundedInteger(500, 10, 5_000),
    DATABASE_CONNECT_TIMEOUT_MS: boundedInteger(10_000, 1_000, 60_000),
    DATABASE_IDLE_TIMEOUT_MS: boundedInteger(60_000, 10_000, 600_000),
    DATABASE_TLS: z.enum(["disabled", "required"]).default("disabled"),
    DATABASE_ENVIRONMENT: z
      .enum(["development", "test", "preview", "production"])
      .default("development"),
    DEPLOYMENT_ENVIRONMENT: z
      .enum(["development", "test", "preview", "production"])
      .optional(),
    SESSION_SECRET: z.string().min(32),
    APP_URL: canonicalAppUrl,
    TRUSTED_PROXY_HEADERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
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
    OUTBOX_ENCRYPTION_KEY: optionalEncryptionKey,
    IMPORT_WORKER_CONCURRENCY: boundedInteger(2, 1, 8),
    IMPORT_WORKER_LEASE_SECONDS: boundedInteger(120, 30, 900),
    IMPORT_WORKER_POLL_MS: boundedInteger(2_000, 250, 60_000),
    EMAIL_WORKER_CONCURRENCY: boundedInteger(2, 1, 8),
    EMAIL_WORKER_LEASE_SECONDS: boundedInteger(60, 15, 600),
    EMAIL_WORKER_POLL_MS: boundedInteger(2_000, 250, 60_000),
    EMAIL_PROVIDER_TIMEOUT_MS: boundedInteger(10_000, 1_000, 60_000),
    SESSION_ABSOLUTE_HOURS: boundedInteger(168, 1, 720),
    ADMIN_SESSION_ABSOLUTE_HOURS: boundedInteger(24, 1, 168),
    SESSION_IDLE_MINUTES: boundedInteger(720, 15, 10_080),
    CLEANUP_BATCH_SIZE: boundedInteger(500, 10, 5_000),
    RAW_CSV_RETENTION_DAYS: boundedInteger(120, 30, 365),
    FAILED_IMPORT_RETENTION_DAYS: boundedInteger(45, 7, 180),
    DRAFT_IMPORT_RETENTION_DAYS: boundedInteger(14, 1, 90),
    AUTH_TOKEN_RETENTION_DAYS: boundedInteger(30, 1, 180),
    SESSION_RETENTION_DAYS: boundedInteger(30, 1, 180),
    APP_VERSION: z.string().trim().min(1).max(80).default("0.1.0"),
    GIT_COMMIT_SHA: optionalTrimmedString,
    GOOGLE_TRANSFERS_APPS_SCRIPT_URL: optionalAppsScriptUrl,
    LEADERBOARD_API_SECRET: optionalTrimmedString,
    GOOGLE_SHEETS_TIMEZONE: timezone,
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    ALLOW_DESTRUCTIVE_DEMO_SEED: z.enum(["true", "false"]).optional(),
    DEMO_SEED_PASSWORD: optionalTrimmedString,
  })
  .superRefine((env, ctx) => {
    const deploymentEnvironment = env.DEPLOYMENT_ENVIRONMENT ?? env.NODE_ENV;
    if (
      (deploymentEnvironment === "production" || deploymentEnvironment === "preview") &&
      new URL(env.APP_URL).protocol !== "https:"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_URL"],
        message: "APP_URL must use HTTPS in preview and production.",
      });
    }
    if (env.DATABASE_ENVIRONMENT !== deploymentEnvironment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_ENVIRONMENT"],
        message:
          "DATABASE_ENVIRONMENT must match DEPLOYMENT_ENVIRONMENT (or NODE_ENV when no deployment environment is configured).",
      });
    }

    const databaseSafetyError = testDatabaseSafetyError({
      databaseUrl: env.DATABASE_URL,
      databaseEnvironment: env.DATABASE_ENVIRONMENT,
      nodeEnvironment: env.NODE_ENV,
    });
    if (databaseSafetyError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message: databaseSafetyError,
      });
    }

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

    if (
      env.OUTBOX_ENCRYPTION_KEY &&
      !isValidEncryptionKey(env.OUTBOX_ENCRYPTION_KEY)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OUTBOX_ENCRYPTION_KEY"],
        message: "OUTBOX_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
      });
    }

    if (env.NODE_ENV === "production" && !env.TEMP_PASSWORD_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TEMP_PASSWORD_ENCRYPTION_KEY"],
        message: "TEMP_PASSWORD_ENCRYPTION_KEY is required in production.",
      });
    }


    if (env.NODE_ENV === "production" && !env.OUTBOX_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OUTBOX_ENCRYPTION_KEY"],
        message: "OUTBOX_ENCRYPTION_KEY is required in production.",
      });
    }

    if (
      Boolean(env.GOOGLE_TRANSFERS_APPS_SCRIPT_URL) !==
      Boolean(env.LEADERBOARD_API_SECRET)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GOOGLE_TRANSFERS_APPS_SCRIPT_URL"],
        message:
          "GOOGLE_TRANSFERS_APPS_SCRIPT_URL and LEADERBOARD_API_SECRET must be configured together.",
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
