import "dotenv/config";

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";

import { getDb, getPool } from "@/db";
import { emailDeliveryAttempts } from "@/db/schema";
import { newId } from "@/lib/ids";

const insertedIds: string[] = [];

describe("email delivery attempts integration", () => {
  afterEach(async () => {
    if (insertedIds.length === 0) return;

    await getDb()
      .delete(emailDeliveryAttempts)
      .where(inArray(emailDeliveryAttempts.id, insertedIds.splice(0)));
  });

  afterAll(async () => {
    await getPool().end();
  });

  it("stores accepted and failed delivery metadata", async () => {
    const acceptedId = newId();
    const failedId = newId();
    const acceptedAt = new Date("2026-07-23T10:15:00.000Z");
    const deliveredAt = new Date("2026-07-23T10:16:00.000Z");
    insertedIds.push(acceptedId, failedId);

    await getDb().insert(emailDeliveryAttempts).values([
      {
        id: acceptedId,
        messageType: "account_invitation",
        provider: "resend",
        recipientEmail: "accepted.integration@example.com",
        status: "accepted",
        providerMessageId: "re_integration_accepted",
        acceptedAt,
        deliveredAt,
      },
      {
        id: failedId,
        messageType: "password_reset",
        provider: "resend",
        recipientEmail: "failed.integration@example.com",
        status: "failed",
        errorMessage: "Email provider rejected the message.",
      },
    ]);

    const rows = await getDb()
      .select()
      .from(emailDeliveryAttempts)
      .where(inArray(emailDeliveryAttempts.id, [acceptedId, failedId]));

    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: acceptedId,
          status: "accepted",
          providerMessageId: "re_integration_accepted",
          acceptedAt: expect.any(Date),
          deliveredAt: expect.any(Date),
        }),
        expect.objectContaining({
          id: failedId,
          status: "failed",
          errorMessage: "Email provider rejected the message.",
        }),
      ]),
    );
  });
});
