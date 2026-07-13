import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useRegisterSessions } from "@/lib/register-store";

export const Route = createFileRoute("/pos/register-sessions")({
  head: () => ({
    meta: [{ title: "Register Sessions — Dhipos" }],
  }),
  component: RegisterSessionsPage,
});

function RegisterSessionsPage() {
  const registerSessions = useRegisterSessions();

  return (
    <AppShell>
      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Register Sessions</h1>
          <p className="text-sm text-muted-foreground">Register sessions for outlet</p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No</TableHead>
                <TableHead>Register</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead>Open Duration</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registerSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No register sessions yet.
                  </TableCell>
                </TableRow>
              )}
              {registerSessions.map((s) => (
                <TableRow key={s.no}>
                  <TableCell className="font-medium">{s.no}</TableCell>
                  <TableCell>
                    {s.register}
                    <span className="block text-xs text-muted-foreground">At Seven Mart</span>
                  </TableCell>
                  <TableCell>
                    {s.createdAt}
                    <span className="block text-xs text-muted-foreground">By {s.by}</span>
                  </TableCell>
                  <TableCell>
                    {s.closedAt ?? ""}
                    {s.closedAt && <span className="block text-xs text-muted-foreground">By {s.by}</span>}
                  </TableCell>
                  <TableCell className={s.closedAt ? "" : "font-medium text-emerald-600"}>
                    {s.openDuration}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => toast(`Session ${s.no} — ${s.register}, ${s.createdAt}`)}>
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppShell>
  );
}
