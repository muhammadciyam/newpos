import { useEffect, useSyncExternalStore } from "react";
import { fetchAuditLog, addAuditLogOnServer } from "@/lib/audit-log-api";
import { safeServerCall } from "@/lib/server-fn-helpers";

export type AuditLog = {
  user: string;
  action: "create" | "update" | "delete" | "login" | "logout" | "view";
  object: string;
  at: string;
};

function formatNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let logs: AuditLog[] = [];
const listeners = new Set<() => void>();

function setLogs(next: AuditLog[]) {
  logs = next;
  listeners.forEach((l) => l());
}

async function refreshFromServer() {
  const result = await safeServerCall(() => fetchAuditLog());
  if (!("networkError" in result)) setLogs(result);
}

let initialFetchTriggered = false;
function ensureInitialFetch() {
  if (initialFetchTriggered) return;
  initialFetchTriggered = true;
  void refreshFromServer();
}

// Fire-and-forget by design — every call site across the app (~9 stores) treats this as a
// synchronous side effect, matching the previous local-only version's signature, so none
// of them need to change. Optimistically prepends locally for instant feedback, then
// persists to the server in the background.
export function logAudit(user: string, action: AuditLog["action"], object: string) {
  const entry: AuditLog = { user, action, object, at: formatNow() };
  setLogs([entry, ...logs].slice(0, 500));
  void safeServerCall(() => addAuditLogOnServer({ data: entry }));
}

// Actively refetches on mount and every `intervalMs` — call this from the Audit Logs
// admin screen so entries logged from other devices show up without a manual refresh.
export function useAuditLogPolling(intervalMs = 5000) {
  useEffect(() => {
    void refreshFromServer();
    const id = setInterval(() => void refreshFromServer(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export function useAuditLogs(): AuditLog[] {
  useEffect(() => ensureInitialFetch(), []);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => logs,
    () => logs,
  );
}
