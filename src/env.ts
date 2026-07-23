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
  });

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
