import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readiness: vi.fn() }));
vi.mock("@/db", () => ({ checkDatabaseReadiness: mocks.readiness }));

import { resetEnvForTests } from "@/env";
import { GET as live } from "@/app/health/live/route";
import { GET as ready } from "@/app/health/ready/route";
import { GET as version } from "@/app/health/version/route";

beforeEach(() => {
  process.env.DATABASE_URL = "mysql://user:password@127.0.0.1:3306/openers_dashboard_test";
  process.env.DATABASE_ENVIRONMENT = "test";
  process.env.DEPLOYMENT_ENVIRONMENT = "test";
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.SESSION_SECRET = "health-route-test-secret-at-least-thirty-two-characters";
  process.env.APP_VERSION = "2.0.0-test";
  process.env.GIT_COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
  resetEnvForTests();
  mocks.readiness.mockReset().mockResolvedValue(undefined);
});

describe("operational health routes", () => {
  it("keeps liveness cheap and uncached", async () => {
    const response = await live();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("reports readiness only while the expected database schema is available", async () => {
    expect((await ready()).status).toBe(200);
    mocks.readiness.mockRejectedValueOnce(new Error("secret database details"));
    const unavailable = await ready();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain("secret database details");
  });

  it("exposes only safe build identity", async () => {
    const response = await version();
    expect(await response.json()).toEqual({
      version: "2.0.0-test",
      commit: "0123456789abcdef0123456789abcdef01234567",
      environment: "test",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
