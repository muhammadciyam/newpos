import { getSupabase } from "@/lib/supabase-client";

// Server-only. Only password-reset-api.ts should import this — never a client component.
//
// Backed by Supabase (see supabase/migrations/0012_password_reset_tokens.sql). Unlike
// every other domain in this app, this one IS a real security boundary — the token itself
// is what proves "this request came from the email we sent", not a client-supplied claim
// — so tokens are generated with crypto.randomUUID() (cryptographically random), expire,
// and are single-use.

type ResetTokenRecord = {
  email: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
};

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function createResetToken(email: string): Promise<string> {
  const supabase = getSupabase();
  const token = crypto.randomUUID().replace(/-/g, "");
  const record: ResetTokenRecord = {
    email,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
    used: false,
  };
  const { error } = await supabase
    .from("password_reset_tokens")
    .insert({ id: token, data: record });
  if (error) throw error;
  return token;
}

export async function getResetToken(token: string): Promise<ResetTokenRecord | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("password_reset_tokens")
    .select("data")
    .eq("id", token)
    .maybeSingle();
  if (error) throw error;
  return (data?.data as ResetTokenRecord | undefined) ?? null;
}

export async function markResetTokenUsed(token: string): Promise<void> {
  const existing = await getResetToken(token);
  if (!existing) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from("password_reset_tokens")
    .update({ data: { ...existing, used: true } })
    .eq("id", token);
  if (error) throw error;
}

// Sends via Resend's REST API directly (no SDK dependency needed for one API call).
// Gracefully "disabled" rather than throwing when not configured — matches the same
// optional-integration pattern as GOOGLE_CSE_API_KEY (src/lib/image-search-api.ts): the
// feature just isn't available yet rather than crashing the app.
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<{ ok: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return {
      error:
        "Password reset emails aren't set up yet — ask your Admin or Super Admin to reset your password instead.",
    };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: email,
      subject: "Reset your Dhipos password",
      html: `
        <p>We received a request to reset your Dhipos password.</p>
        <p><a href="${resetUrl}">Click here to set a new password</a> — this link expires in 30 minutes and can only be used once.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("sendPasswordResetEmail: Resend request failed", res.status, body);
    return { error: "Couldn't send the reset email right now — please try again shortly." };
  }
  return { ok: true };
}
