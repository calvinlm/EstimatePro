import { AppError } from "../errors/app-error";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
};

type SendPasswordResetEmailInput = {
  to: string;
  recipientName: string;
  resetLink: string;
};

type SendUserInviteEmailInput = {
  to: string;
  setupLink: string;
  role: string;
};

function getEmailConfig(): { apiKey: string; from: string } {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new AppError(500, "EMAIL_NOT_CONFIGURED", "Email provider is not configured");
  }

  return { apiKey, from };
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { apiKey, from } = getEmailConfig();
  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: input.subject,
      text: input.text,
      html: input.html,
    }),
  });

  if (!response.ok) {
    throw new AppError(502, "EMAIL_DISPATCH_FAILED", "Failed to dispatch email");
  }
}

export async function sendPasswordResetEmail(input: SendPasswordResetEmailInput): Promise<void> {
  const html = [
    `<p>Hello ${input.recipientName},</p>`,
    "<p>We received a request to reset your EstimatePro PH password.</p>",
    `<p><a href="${input.resetLink}">Reset your password</a></p>`,
    "<p>This link expires in 1 hour.</p>",
    "<p>If you did not request this, you can ignore this email.</p>",
  ].join("");

  const text = [
    `Hello ${input.recipientName},`,
    "",
    "We received a request to reset your EstimatePro PH password.",
    `Reset your password: ${input.resetLink}`,
    "",
    "This link expires in 1 hour.",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  await sendEmail({
    to: input.to,
    subject: "Reset your EstimatePro PH password",
    text,
    html,
  });
}

export async function sendUserInviteEmail(input: SendUserInviteEmailInput): Promise<void> {
  const html = [
    "<p>Hello,</p>",
    "<p>You have been invited to EstimatePro PH.</p>",
    `<p>Assigned role: <strong>${input.role}</strong></p>`,
    `<p><a href="${input.setupLink}">Set up your account</a></p>`,
    "<p>This is a one-time setup link.</p>",
  ].join("");

  const text = [
    "Hello,",
    "",
    "You have been invited to EstimatePro PH.",
    `Assigned role: ${input.role}`,
    `Set up your account: ${input.setupLink}`,
    "",
    "This is a one-time setup link.",
  ].join("\n");

  await sendEmail({
    to: input.to,
    subject: "You are invited to EstimatePro PH",
    text,
    html,
  });
}
