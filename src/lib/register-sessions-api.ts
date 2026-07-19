import { createServerFn } from "@tanstack/react-start";
import {
  getServerRegisterSessions,
  mutateServerRegisterSessions,
} from "@/lib/register-sessions-server-store";
import type { RegisterSession, RegisterSessionClosing } from "@/lib/pos-data";

export const fetchRegisterSessions = createServerFn({ method: "GET" }).handler(async () => {
  return getServerRegisterSessions();
});

// The client computes the full session record (id, no, createdAt, ...) itself — same
// all-client-trust model as register-api.ts — this just persists it.
export const createRegisterSessionOnServer = createServerFn({ method: "POST" })
  .validator((data: RegisterSession) => data)
  .handler(async ({ data }) => {
    await mutateServerRegisterSessions((ss) => [data, ...ss]);
    return { ok: true as const };
  });

// The client computes closedAt/openDuration itself (using its own clock, same as before
// this moved server-side — computing them here instead would use the server process's
// timezone, not the shop's) — this just finds the matching still-open session for
// `register` and applies the patch.
export const closeRegisterSessionOnServer = createServerFn({ method: "POST" })
  .validator(
    (data: {
      register: string;
      closedAt: string;
      openDuration: string;
      closing?: RegisterSessionClosing;
    }) => data,
  )
  .handler(async ({ data }) => {
    await mutateServerRegisterSessions((ss) => {
      const idx = ss.findIndex((s) => s.register === data.register && s.closedAt === null);
      if (idx === -1) return ss;
      const updated = [...ss];
      updated[idx] = {
        ...updated[idx],
        closedAt: data.closedAt,
        openDuration: data.openDuration,
        closing: data.closing,
      };
      return updated;
    });
    return { ok: true as const };
  });
