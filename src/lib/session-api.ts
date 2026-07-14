import { createServerFn } from "@tanstack/react-start";
import { getServerSessionState, mutateServerSessionState } from "@/lib/session-server-store";

export const fetchSessionsOnServer = createServerFn({ method: "GET" }).handler(async () => {
  return getServerSessionState();
});

// Claims the login session for `email` on `deviceId`. Refuses if a DIFFERENT device
// already holds it; re-claiming from the same device (e.g. a page refresh) is a no-op.
export const claimSessionOnServer = createServerFn({ method: "POST" })
  .validator((data: { email: string; deviceId: string }) => data)
  .handler(async ({ data }) => {
    const state = getServerSessionState();
    const existing = state[data.email];
    if (existing && existing.deviceId !== data.deviceId) {
      const since = new Date(existing.loginAt).toLocaleString();
      return {
        error: `This account is already logged in on another device since ${since}. Log out there first, or ask an Admin to force logout.`,
      };
    }
    const loginAt = existing?.deviceId === data.deviceId ? existing.loginAt : Date.now();
    mutateServerSessionState((s) => ({ ...s, [data.email]: { deviceId: data.deviceId, loginAt } }));
    return { ok: true as const };
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
