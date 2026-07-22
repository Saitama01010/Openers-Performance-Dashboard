import "server-only";

import { getEnv } from "@/env";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  send(message: TransactionalEmail): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: TransactionalEmail) {
    if (getEnv().NODE_ENV === "production") {
      throw new Error("Console email delivery is disabled in production.");
    }

    console.info(`[development email] to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}

export function getEmailProvider(): EmailProvider {
  const env = getEnv();

  if (env.EMAIL_PROVIDER === "console") {
    return new ConsoleEmailProvider();
  }

  throw new Error(`Unsupported email provider: ${env.EMAIL_PROVIDER}`);
}

export async function sendInvitationEmail(input: {
  email: string;
  name: string;
  token: string;
}) {
  const url = new URL("/accept-invitation", getEnv().APP_URL);
  url.searchParams.set("token", input.token);
  await getEmailProvider().send({
    to: input.email,
    subject: "Set up your Openers Dashboard account",
    text: `Hello ${input.name},\n\nCreate your password using this expiring, single-use link:\n${url.toString()}`,
  });
}

export async function sendPasswordResetEmail(input: {
  email: string;
  name: string;
  token: string;
}) {
  const url = new URL("/reset-password", getEnv().APP_URL);
  url.searchParams.set("token", input.token);
  await getEmailProvider().send({
    to: input.email,
    subject: "Reset your Openers Dashboard password",
    text: `Hello ${input.name},\n\nReset your password using this expiring, single-use link:\n${url.toString()}`,
  });
}

export async function sendPasswordChangedEmail(input: {
  email: string;
  name: string;
}) {
  await getEmailProvider().send({
    to: input.email,
    subject: "Your Openers Dashboard password changed",
    text: `Hello ${input.name},\n\nYour password was changed and all previous sessions were revoked.`,
  });
}
