import { createServerFn } from "@tanstack/react-start";
import { getServerUsers, mutateServerUsers } from "@/lib/users-server-store";
import { getServerOutlets } from "@/lib/outlets-server-store";
import {
  createResetToken,
  getResetToken,
  markResetTokenUsed,
  sendPasswordResetEmail,
} from "@/lib/password-reset-server-store";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

// Looks up the account by outlet + email — same rule as login (src/lib/users-api.ts's
// loginOnServer): the email must belong to an account assigned to that exact outlet, or
// to Super Admin (who isn't tied to one outlet). Always returns ok:true whether or not a
// match was actually found, and takes the same path either way, so this can never be used
// to probe which outlet/email combinations are real accounts.
export const requestPasswordResetOnServer = createServerFn({ method: "POST" })
  .validator((data: { outletName: string; email: string; resetBaseUrl: string }) => data)
  .handler(async ({ data }) => {
    const outlets = await getServerOutlets();
    const outlet = outlets.find((o) => normalize(o.name) === normalize(data.outletName));
    const users = await getServerUsers();
    const email = normalize(data.email);
    const user = users.find(
      (u) =>
        u.email === email &&
        u.status === "Active" &&
        (u.role === "Super Admin" || (outlet && u.outletId === outlet.id)),
    );

    // From here on, always return ok:true no matter what happens — surfacing a different
    // result for "email not configured" or "send failed" than for "no match" would leak
    // exactly the account-existence info this endpoint exists to hide. Failures are only
    // logged server-side; a real, blocked user still has the Admin > Users reset fallback.
    if (!user) return { ok: true as const };

    try {
      const token = await createResetToken(user.email);
      const resetUrl = `${data.resetBaseUrl.replace(/\/$/, "")}/reset-password?token=${token}`;
      const sendResult = await sendPasswordResetEmail(user.email, resetUrl);
      if ("error" in sendResult) {
        console.error("requestPasswordResetOnServer: send failed", sendResult.error);
      }
    } catch (err) {
      console.error("requestPasswordResetOnServer: failed to create/send reset token", err);
    }
    return { ok: true as const };
  });

export const resetPasswordOnServer = createServerFn({ method: "POST" })
  .validator((data: { token: string; newPassword: string }) => data)
  .handler(async ({ data }) => {
    const record = await getResetToken(data.token);
    if (!record) return { error: "This reset link is invalid — request a new one." };
    if (record.used) return { error: "This reset link has already been used." };
    if (Date.now() > record.expiresAt) {
      return { error: "This reset link has expired — request a new one." };
    }

    const email = normalize(record.email);
    const users = await getServerUsers();
    if (!users.some((u) => u.email === email)) {
      return { error: "This account no longer exists." };
    }

    await mutateServerUsers((us) =>
      us.map((u) => (u.email === email ? { ...u, password: data.newPassword } : u)),
    );
    await markResetTokenUsed(data.token);
    return { ok: true as const };
  });
