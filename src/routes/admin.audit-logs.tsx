import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { RestrictedPage } from "@/components/restricted-page";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuditLogs, useAuditLogPolling } from "@/lib/audit-log-store";
import { useHasPermission } from "@/lib/permissions";

export const Route = createFileRoute("/admin/audit-logs")({
  head: () => ({
    meta: [{ title: "Audit Logs — Dhipos" }],
  }),
  component: AuditLogsPage,
});

const actionColor: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  update: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  delete: "bg-destructive/10 text-destructive hover:bg-destructive/10",
  login: "bg-primary/10 text-primary hover:bg-primary/10",
  logout: "bg-muted text-muted-foreground hover:bg-muted",
  view: "bg-violet-100 text-violet-700 hover:bg-violet-100",
};

function AuditLogsPage() {
  const canViewAuditLogs = useHasPermission("settings.manage");
  const auditLogs = useAuditLogs();
  useAuditLogPolling();

  if (!canViewAuditLogs) return <RestrictedPage />;

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company / User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Object</TableHead>
                <TableHead>At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No activity recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {auditLogs.map((log, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{log.user}</TableCell>
                  <TableCell>
                    <Badge className={actionColor[log.action]} variant="outline">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>{log.object}</TableCell>
                  <TableCell className="text-muted-foreground">{log.at}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppShell>
  );
}
