import { describe, expect, it } from "vitest";

import { demoSeedSafetyError } from "@/db/demo-seed-safety";

const safe = {
  ALLOW_DESTRUCTIVE_DEMO_SEED: "true",
  DATABASE_URL: "mysql://user:pass@127.0.0.1:3306/openers_development",
  DATABASE_ENVIRONMENT: "development",
  DEPLOYMENT_ENVIRONMENT: "development",
  NODE_ENV: "development",
  DEMO_SEED_PASSWORD: "Unique-local-demo!42",
} satisfies NodeJS.ProcessEnv;

describe("destructive demo seed safety", () => {
  it("allows only an explicit local development seed", () => {
    expect(demoSeedSafetyError(safe)).toBeNull();
  });

  it.each([
    { NODE_ENV: "production" },
    { DATABASE_ENVIRONMENT: "production", DEPLOYMENT_ENVIRONMENT: "production" },
    { DATABASE_ENVIRONMENT: "preview", DEPLOYMENT_ENVIRONMENT: "preview" },
    { DEPLOYMENT_ENVIRONMENT: "production" },
    { DEPLOYMENT_ENVIRONMENT: "preview" },
  ])("rejects production-like configuration %#", (override) => {
    expect(
      demoSeedSafetyError({ ...safe, ...override } as NodeJS.ProcessEnv),
    ).not.toBeNull();
  });

  it("requires explicit opt-in and rejects remote development databases", () => {
    expect(demoSeedSafetyError({ ...safe, ALLOW_DESTRUCTIVE_DEMO_SEED: "false" })).toContain("requires");
    expect(demoSeedSafetyError({ ...safe, DATABASE_URL: "mysql://user:pass@db.example.com/openers" })).toContain("non-local");
  });

  it("rejects the former public demo credential", () => {
    expect(demoSeedSafetyError({ ...safe, DEMO_SEED_PASSWORD: "Password123!" })).toContain("non-public");
  });
});
