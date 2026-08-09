import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

import { authenticateCredentials } from "@/auth/service";
import { hashPassword } from "@/auth/password";
import { getDb } from "@/db";
import { auditLogs, profiles, sessions } from "@/db/schema";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];

afterEach(async () => {
  const ids = profileIds.splice(0);
  if (ids.length === 0) return;
  await getDb().delete(auditLogs).where(inArray(auditLogs.actorProfileId, ids));
  await getDb().delete(sessions).where(inArray(sessions.profileId, ids));
  await getDb().delete(profiles).where(inArray(profiles.id, ids));
});

async function createCredentialProfile(status: "active" | "deactivated" = "active") {
  const id = newId();
  profileIds.push(id);
  const password = "Valid-Credential-Password-123!";
  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: "Credential Test",
    role: "agent",
    active: status === "active",
    accountStatus: status,
    passwordHash: await hashPassword(password),
  });
  return { id, email: `${id}@example.test`, password };
}

describe("credential authentication", () => {
  it("accepts valid credentials and uses the same generic failure for bad and unknown accounts", async () => {
    const profile = await createCredentialProfile();

    expect(await authenticateCredentials(profile.email, profile.password)).toMatchObject({ ok: true });
    const wrong = await authenticateCredentials(profile.email, "Wrong-Credential-Password-123!");
    const unknown = await authenticateCredentials(`${newId()}@example.test`, "Wrong-Credential-Password-123!");
    expect(wrong).toEqual({ ok: false, error: "Invalid email or password." });
    expect(unknown).toEqual(wrong);
  });

  it("rejects deactivated accounts and oversized password input safely", async () => {
    const profile = await createCredentialProfile("deactivated");
    expect(await authenticateCredentials(profile.email, profile.password)).toEqual({
      ok: false,
      error: "Invalid email or password.",
    });
    expect(await authenticateCredentials(profile.email, "x".repeat(257))).toEqual({
      ok: false,
      error: "Invalid email or password.",
    });
  });
});
