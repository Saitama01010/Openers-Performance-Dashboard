import "server-only";

import { Resend } from "resend";

import { getEnv } from "@/env";

export type EmailProviderName = "console" | "resend";

export type EmailMessageType =
  | "account_invitation"
  | "account_invitation_resent"
  | "password_reset"
  | "password_changed"
  | "access_revoked";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey?: string;
};

type ProviderSendResult = {
  acceptedAt: Date | null;
  providerMessageId: string | null;
};

export type EmailDeliveryResult =
  | {
      ok: true;
      provider: EmailProviderName;
      acceptedAt: Date | null;
      providerMessageId: string | null;
    }
  | {
      ok: false;
      provider: EmailProviderName;
      error: string;
    };

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: TransactionalEmail): Promise<ProviderSendResult>;
}

function emailIdempotencyKey(messageType: EmailMessageType, recordId: string) {
  return `${messageType}:${recordId}`;
}

function formatSender() {
  const env = getEnv();
  return `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`;
}

function loginUrl() {
  return new URL("/login", getEnv().APP_URL).toString();
}

function actionLink(pathname: string, token: string) {
  const url = new URL(pathname, getEnv().APP_URL);
  url.searchParams.set("token", token);
  return url.toString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTransactionalEmail(input: {
  actionLabel: string;
  actionUrl: string;
  body: string[];
  expirationNotice: string;
  greetingName: string;
  securityNotice?: string;
  subject: string;
}) {
  const securityNotice =
    input.securityNotice ??
    "If you did not request this message, ignore it and contact your administrator.";
  const escapedBody = input.body.map((paragraph) => escapeHtml(paragraph));
  const escapedUrl = escapeHtml(input.actionUrl);
  const escapedGreetingName = escapeHtml(input.greetingName);
  const escapedActionLabel = escapeHtml(input.actionLabel);
  const escapedSubject = escapeHtml(input.subject);
  const escapedSecurityNotice = escapeHtml(securityNotice);
  const escapedExpirationNotice = escapeHtml(input.expirationNotice);

  return {
    html: `
      <div style="background:#f3f4f6;padding:24px;font-family:Arial,sans-serif;color:#111827;">
        <div style="margin:0 auto;max-width:640px;border-radius:16px;background:#ffffff;padding:32px;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;">DialExpert</p>
          <h1 style="margin:0 0 20px;font-size:28px;line-height:1.2;color:#0f172a;">${escapedSubject}</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">Hello ${escapedGreetingName},</p>
          ${escapedBody
            .map(
              (paragraph) =>
                `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#334155;">${paragraph}</p>`,
            )
            .join("")}
          <div style="margin:28px 0;">
            <a href="${escapedUrl}" style="display:inline-block;border-radius:9999px;background:#0f766e;padding:14px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">
              ${escapedActionLabel}
            </a>
          </div>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475569;">If the button does not work, use this link:</p>
          <p style="margin:0 0 16px;word-break:break-word;font-size:14px;line-height:1.6;color:#0f766e;">${escapedUrl}</p>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#475569;">${escapedExpirationNotice}</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#b91c1c;">${escapedSecurityNotice}</p>
        </div>
      </div>
    `.trim(),
    text: [
      `DialExpert`,
      "",
      `Hello ${input.greetingName},`,
      "",
      ...input.body.flatMap((paragraph) => [paragraph, ""]),
      `${input.actionLabel}:`,
      input.actionUrl,
      "",
      `If the button does not work, use this link:`,
      input.actionUrl,
      "",
      input.expirationNotice,
      securityNotice,
    ].join("\n"),
  };
}

function safeDeliveryError(error: unknown) {
  const env = getEnv();
  const rawMessage =
    error instanceof Error ? error.message : "Email delivery failed.";
  const sanitizedMessage = env.RESEND_API_KEY
    ? rawMessage.replaceAll(env.RESEND_API_KEY, "[redacted]")
    : rawMessage;

  if (sanitizedMessage.includes("Console email delivery is disabled")) {
    return "Console email delivery is disabled in production.";
  }

  if (/api key|authentication/i.test(sanitizedMessage)) {
    return "Email provider authentication failed.";
  }

  if (/from address|sender/i.test(sanitizedMessage)) {
    return "Email provider rejected the configured sender address.";
  }

  return sanitizedMessage;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  async send(message: TransactionalEmail) {
    const env = getEnv();

    if (env.NODE_ENV === "production") {
      throw new Error("Console email delivery is disabled in production.");
    }

    console.info(
      `[development email accepted] to=${message.to} subject=${message.subject} body=[redacted]`,
    );

    return {
      acceptedAt: new Date(),
      providerMessageId: null,
    } satisfies ProviderSendResult;
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  readonly #client: Resend;

  constructor() {
    this.#client = new Resend(getEnv().RESEND_API_KEY);
  }

  async send(message: TransactionalEmail) {
    const env = getEnv();
    const result = await this.#client.emails.send(
      {
        from: formatSender(),
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: env.EMAIL_REPLY_TO ? [env.EMAIL_REPLY_TO] : undefined,
      },
      message.idempotencyKey
        ? { idempotencyKey: message.idempotencyKey }
        : undefined,
    );

    if (result.error) {
      throw new Error(result.error.message);
    }

    return {
      acceptedAt: result.data?.id ? new Date() : null,
      providerMessageId: result.data?.id ?? null,
    } satisfies ProviderSendResult;
  }
}

export function getEmailProvider(): EmailProvider {
  const env = getEnv();

  if (env.EMAIL_PROVIDER === "console") {
    return new ConsoleEmailProvider();
  }

  return new ResendEmailProvider();
}

export async function deliverEmail(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  const provider = getEmailProvider();

  try {
    const result = await provider.send(message);
    return {
      ok: true,
      provider: provider.name,
      acceptedAt: result.acceptedAt,
      providerMessageId: result.providerMessageId,
    };
  } catch (error) {
    return {
      ok: false,
      provider: provider.name,
      error: safeDeliveryError(error),
    };
  }
}

export function invitationEmail(input: {
  email: string;
  name: string;
  token: string;
  tokenId: string;
  resent?: boolean;
}) {
  const actionUrl = actionLink("/accept-invitation", input.token);
  const content = renderTransactionalEmail({
    actionLabel: "Accept invitation",
    actionUrl,
    body: [
      input.resent
        ? "Your DialExpert invitation was resent. Use the secure link below to finish setting up your account."
        : "An administrator invited you to DialExpert. Use the secure link below to finish setting up your account.",
      "Create your password to activate your access. Never share this link or your password with anyone.",
    ],
    expirationNotice: `This invitation link expires in ${getEnv().INVITATION_TTL_HOURS} hours.`,
    greetingName: input.name,
    subject: input.resent
      ? "Your DialExpert invitation was resent"
      : "Set up your DialExpert account",
  });

  return {
    to: input.email,
    subject: input.resent
      ? "Your DialExpert invitation was resent"
      : "Set up your DialExpert account",
    text: content.text,
    html: content.html,
    idempotencyKey: emailIdempotencyKey(
      input.resent ? "account_invitation_resent" : "account_invitation",
      input.tokenId,
    ),
  } satisfies TransactionalEmail;
}

export function passwordResetEmail(input: {
  email: string;
  name: string;
  token: string;
  tokenId: string;
}) {
  const actionUrl = actionLink("/reset-password", input.token);
  const content = renderTransactionalEmail({
    actionLabel: "Reset password",
    actionUrl,
    body: [
      "We received a request to reset your DialExpert password.",
      "Use the secure link below to choose a new password. This link can only be used once.",
    ],
    expirationNotice: `This reset link expires in ${getEnv().PASSWORD_RESET_TTL_MINUTES} minutes.`,
    greetingName: input.name,
    subject: "Reset your DialExpert password",
  });

  return {
    to: input.email,
    subject: "Reset your DialExpert password",
    text: content.text,
    html: content.html,
    idempotencyKey: emailIdempotencyKey("password_reset", input.tokenId),
  } satisfies TransactionalEmail;
}

export function passwordChangedEmail(input: { email: string; name: string }) {
  const content = renderTransactionalEmail({
    actionLabel: "Review your account",
    actionUrl: loginUrl(),
    body: [
      "Your DialExpert password was changed and your existing sessions were revoked.",
      "If you did not make this change, reset your password again and contact your administrator immediately.",
    ],
    expirationNotice: "This security notice does not expire, but review it immediately.",
    greetingName: input.name,
    securityNotice:
      "If you did not request this password change, ignore this message after you contact your administrator and secure your account.",
    subject: "Your DialExpert password changed",
  });

  return {
    to: input.email,
    subject: "Your DialExpert password changed",
    text: content.text,
    html: content.html,
  } satisfies TransactionalEmail;
}

export function accessRevokedEmail(input: { email: string; name: string }) {
  const content = renderTransactionalEmail({
    actionLabel: "Open DialExpert",
    actionUrl: loginUrl(),
    body: [
      "Your DialExpert access was revoked by an administrator.",
      "If you believe this was unexpected, contact your administrator before attempting to sign in again.",
    ],
    expirationNotice: "This access notice does not expire, but any related action should be taken immediately.",
    greetingName: input.name,
    subject: "Your DialExpert access was revoked",
  });

  return {
    to: input.email,
    subject: "Your DialExpert access was revoked",
    text: content.text,
    html: content.html,
  } satisfies TransactionalEmail;
}

export async function sendInvitationEmail(input: {
  email: string;
  name: string;
  token: string;
  tokenId: string;
  resent?: boolean;
}) {
  const result = await deliverEmail(invitationEmail(input));
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function sendPasswordResetEmail(input: {
  email: string;
  name: string;
  token: string;
  tokenId: string;
}) {
  const result = await deliverEmail(passwordResetEmail(input));
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function sendPasswordChangedEmail(input: {
  email: string;
  name: string;
}) {
  const result = await deliverEmail(passwordChangedEmail(input));
  if (!result.ok) throw new Error(result.error);
  return result;
}

export async function sendAccessRevokedEmail(input: {
  email: string;
  name: string;
}) {
  const result = await deliverEmail(accessRevokedEmail(input));
  if (!result.ok) throw new Error(result.error);
  return result;
}
