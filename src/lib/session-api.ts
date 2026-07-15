import { createServerFn } from "@tanstack/react-start";
import { getServerSessionState, mutateServerSessionState } from "@/lib/session-server-store";

export const fetchSessionsOnServer = createServerFn({ method: "GET" }).handler(async () => {
  return getServerSessionState();
});

// Claims the login session for `email` on `deviceId`. If a DIFFERENT device already
// holds it, this takes it over (that device finds out via checkSessionOnServer and is
// logged out locally) rather than refusing — logging in somewhere new always wins.
export const claimSessionOnServer = createServerFn({ method: "POST" })
  .validator((data: { email: string; deviceId: string }) => data)
  .handler(async ({ data }) => {
    const existing = getServerSessionState()[data.email];
    const loginAt = existing?.deviceId === data.deviceId ? existing.loginAt : Date.now();
    mutateServerSessionState((s) => ({ ...s, [data.email]: { deviceId: data.deviceId, loginAt } }));
    return { ok: true as const };
  });

// Lets a logged-in device check whether it still holds the session, or whether a
// newer login elsewhere has taken it over. No record at all also counts as invalid
// (e.g. the server restarted and lost session state) — the safe default is to require
// signing back in rather than silently trusting a claim nothing can confirm.
export const checkSessionOnServer = createServerFn({ method: "POST" })
  .validator((data: { email: string; deviceId: string }) => data)
  .handler(async ({ data }) => {
    const existing = getServerSessionState()[data.email];
    return { valid: existing?.deviceId === data.deviceId };
  });

export const releaseSessionOnServer = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    mutateServerSessionState((s) => {
      const next = { ...s };
      delete next[data.email];
      return next;
    });
    return { ok: true as const };
  });

export const forceLogoutOnServer = createServerFn({ method: "POST" })
  .validator((data: { email: string; role: string }) => data)
  .handler(async ({ data }) => {
    // `role` is a client-supplied claim — this app has no server-verified auth/session
    // anywhere (src/lib/auth-store.ts checks passwords entirely in the browser). This is
    // a UI-level guard consistent with the app's existing all-client-trust permission
    // model (src/lib/permissions.ts), not a real security boundary against a malicious client.
    if (data.role !== "Admin" && data.role !== "Super Admin") {
      return { error: "Only an Admin can force-logout a user" };
    }
    mutateServerSessionState((s) => {
      const next = { ...s };
      delete next[data.email];
      return next;
    });
    return { ok: true as const };
  });
