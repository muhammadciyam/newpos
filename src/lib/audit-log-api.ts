import { createServerFn } from "@tanstack/react-start";
import {
  getServerAuditLog,
  appendServerAuditLog,
  type ServerAuditLog,
} from "@/lib/audit-log-server-store";

export const fetchAuditLog = createServerFn({ method: "GET" }).handler(async () => {
  return getServerAuditLog();
});

export const addAuditLogOnServer = createServerFn({ method: "POST" })
  .validator((data: ServerAuditLog) => data)
  .handler(async ({ data }) => {
    appendServerAuditLog(data);
    return { ok: true as const };
  });
