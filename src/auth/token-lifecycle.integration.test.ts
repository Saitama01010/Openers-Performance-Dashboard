import "@/test/integration-env";

import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  accountInvitationTokens,
  auditLogs,
  emailDeliveryAttempts,
  passwordResetTokens,
  profiles,
  sessions,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/auth/password";
import { createOpaqueToken, hashOpaqueToken } from "@/auth/security";
import {
  acceptInvitation,
  inspectInvitationToken,
  inspectPasswordResetToken,
  resetPassword,
} from "@/auth/service";
import { newId } from "@/lib/ids";

vi.mock("server-only", () => ({}));

const profileIds: string[] = [];

function strongPassword(seed: string) {
  return `Strong-${seed}-Password-123!`;
}

async function createProfile(input?: {
  accountStatus?: "invited" | "active";
  password?: string;
}) {
  const id = newId();
  profileIds.push(id);

  await getDb().insert(profiles).values({
    id,
    email: `${id}@example.test`,
    name: `Lifecycle ${id.slice(0, 8)}`,
    role: "agent",
    active: true,
    accountStatus: input?.accountStatus ?? "active",
    passwordHash: input?.password ? await hashPassword(input.password) : null,
  });

  return id;
}

async function createInvitation(profileId: string, options?: {
  createdAt?: Date;
  expiresAt?: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}) {
  const token = createOpaqueToken();
  const id = newId();

  await getDb().insert(accountInvitationTokens).values({
    id,
    profileId,
    tokenHash: hashOpaqueToken(token),
    deliveryStatus: options?.revokedAt ? "revoked" : "pending",
    expiresAt:
      options?.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
    usedAt: options?.usedAt,
    revokedAt: options?.revokedAt,
    createdAt: options?.createdAt,
  });

  return { id, token };
}

async function createReset(profileId: string, options?: {
  createdAt?: Date;
  expiresAt?: Date;
  usedAt?: Date | null;
  revokedAt?: Date | null;
}) {
  const token = createOpaqueToken();
  const id = newId();

  await getDb().insert(passwordResetTokens).values({
    id,
    profileId,
    tokenHash: hashOpaqueToken(token),
    expiresAt:
      options?.expiresAt ?? new Date(Date.now() + 1000 * 60 * 60),
    usedAt: options?.usedAt,
    revokedAt: options?.revokedAt,
    createdAt: options?.createdAt,
  });

  return { id, token };
}

describe("auth token lifecycle integration", () => {
  afterEach(async () => {
    if (profileIds.length === 0) return;
    const ids = profileIds.splice(0);

    await getDb()
      .delete(auditLogs)
      .where(
        or(
          inArray(auditLogs.actorProfileId, ids),
          inArray(auditLogs.entityId, ids),
        ),
      );
    await getDb().delete(sessions).where(inArray(sessions.profileId, ids));
    await getDb()
      .delete(accountInvitationTokens)
      .where(inArray(accountInvitationTokens.profileId, ids));
    await getDb()
      .delete(passwordResetTokens)
      .where(inArray(passwordResetTokens.profileId, ids));
    await getDb()
      .delete(emailDeliveryAttempts)
      .where(inArray(emailDeliveryAttempts.profileId, ids));
    await getDb().delete(profiles).where(inArray(profiles.id, ids));
  });

  it("accepts only the newest invitation once and revokes reset tokens", async () => {
    const profileId = await createProfile({ accountStatus: "invited" });
    const oldInvitation = await createInvitation(profileId, {
      createdAt: new Date(Date.now() - 1000 * 60),
    });
    const latestInvitation = await createInvitation(profileId, {
      createdAt: new Date(),
    });
    await createReset(profileId);

    expect(await inspectInvitationToken(oldInvitation.token)).toEqual({
      status: "superseded",
    });
    expect(await inspectInvitationToken(latestInvitation.token)).toEqual({
      status: "valid",
    });

    await expect(
      Promise.all([
        acceptInvitation({
          token: latestInvitation.token,
          password: strongPassword("invite-a"),
        }),
        acceptInvitation({
          token: latestInvitation.token,
          password: strongPassword("invite-b"),
        }),
      ]),
    ).resolves.toEqual(
      expect.arrayContaining([
        { ok: true },
        {
          ok: false,
          error: "This invitation link is invalid or has already been used.",
        },
      ]),
    );

    expect(await inspectInvitationToken(latestInvitation.token)).toEqual({
      status: "used",
    });
    expect(
      await acceptInvitation({
        token: latestInvitation.token,
        password: strongPassword("invite-c"),
      }),
    ).toEqual({
      ok: false,
      error: "This invitation link is invalid or has already been used.",
    });

    const tokenRows = await getDb()
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.profileId, profileId));
    expect(tokenRows.every((row) => row.revokedAt)).toBe(true);
  });

  it("rejects used, revoked, expired, and ineligible invitation inspection", async () => {
    const invitedId = await createProfile({ accountStatus: "invited" });
    const activeId = await createProfile({
      accountStatus: "active",
      password: strongPassword("active"),
    });
    const used = await createInvitation(invitedId, { usedAt: new Date() });
    const revoked = await createInvitation(invitedId, { revokedAt: new Date() });
    const expired = await createInvitation(invitedId, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const ineligible = await createInvitation(activeId);

    expect((await inspectInvitationToken(used.token)).status).toBe("used");
    expect((await inspectInvitationToken(revoked.token)).status).toBe("revoked");
    expect((await inspectInvitationToken(expired.token)).status).toBe("expired");
    expect((await inspectInvitationToken(ineligible.token)).status).toBe(
      "account_not_eligible",
    );
  });

  it(
    "uses only the newest reset once, revokes sessions, and rejects password reuse",
    async () => {
      const currentPassword = strongPassword("current");
      const profileId = await createProfile({
        accountStatus: "active",
        password: currentPassword,
      });
      const oldReset = await createReset(profileId, {
        createdAt: new Date(Date.now() - 1000 * 60),
      });
      const latestReset = await createReset(profileId, { createdAt: new Date() });
      const sessionId = newId();

      await getDb().insert(sessions).values({
        id: sessionId,
        profileId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      expect(await inspectPasswordResetToken(oldReset.token)).toEqual({
        status: "superseded",
      });
      expect(
        await resetPassword({
          token: oldReset.token,
          password: strongPassword("old-link"),
        }),
      ).toEqual({
        ok: false,
        error: "This link is no longer valid. Request a new link.",
      });
      expect(
        await resetPassword({
          token: latestReset.token,
          password: currentPassword,
        }),
      ).toEqual({
        ok: false,
        error:
          "Your new password must be different from your current password.",
      });

      const newPassword = strongPassword("new");
      expect(
        await resetPassword({ token: latestReset.token, password: newPassword }),
      ).toEqual({ ok: true });
      expect(
        await resetPassword({
          token: latestReset.token,
          password: strongPassword("again"),
        }),
      ).toEqual({
        ok: false,
        error: "This reset link is invalid or has already been used.",
      });

      const [profile] = await getDb()
        .select()
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1);
      expect(profile?.passwordHash).toBeTruthy();
      expect(await verifyPassword(newPassword, profile!.passwordHash!)).toBe(
        true,
      );

      const [session] = await getDb()
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.id, sessionId), eq(sessions.profileId, profileId)),
        )
        .limit(1);
      expect(session?.revokedAt).toBeInstanceOf(Date);
    },
    10000,
  );

  it("rejects revoked and expired reset inspection", async () => {
    const profileId = await createProfile({
      accountStatus: "active",
      password: strongPassword("inspection"),
    });
    const revoked = await createReset(profileId, { revokedAt: new Date() });
    const expired = await createReset(profileId, {
      expiresAt: new Date(Date.now() - 1000),
    });

    expect((await inspectPasswordResetToken(revoked.token)).status).toBe("revoked");
    expect((await inspectPasswordResetToken(expired.token)).status).toBe("expired");
  });
});
