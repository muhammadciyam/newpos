import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";

export type AuditLog = {
  user: string;
  action: "create" | "update" | "delete" | "login" | "logout";
  object: string;
  at: string;
};

const store = createPersistedStore<AuditLog[]>("dhipos-audit-logs", []);

function formatNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function logAudit(user: string, action: AuditLog["action"], object: string) {
  store.set((logs) => [{ user, action, object, at: formatNow() }, ...logs].slice(0, 500));
}

export function useAuditLogs() {
  return usePersistedStore(store);
}
