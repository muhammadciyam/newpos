import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Inbox, Store, LogOut, UserCircle, CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRegister } from "@/lib/register-store";
import { authStore, useCurrentUser } from "@/lib/auth-store";
import { logAudit, useAuditLogs, useAuditLogPolling } from "@/lib/audit-log-store";
import { pendingSaleStore } from "@/lib/pending-sale-store";
import { usePendingBills, syncPendingBills } from "@/lib/bills-store";
import { settingsStore } from "@/lib/settings-store";
import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";
import { accentColors, setAccentColor, useAccentColor } from "@/lib/theme-store";
import { cn } from "@/lib/utils";

// Per-device — just remembers the newest activity timestamp already seen, so the dot only
// shows when something happened since the last time this device's inbox was opened.
const lastSeenStore = createPersistedStore<string | null>("dhipos-notifications-last-seen", null);

const actionLabels: Record<"create" | "update" | "delete" | "login" | "logout" | "view", string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  login: "logged in",
  logout: "logged out",
  view: "viewed",
};

export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const register = useRegister();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const activity = useAuditLogs();
  useAuditLogPolling();
  const lastSeenAt = usePersistedStore(lastSeenStore);
  const hasUnseen = activity.length > 0 && activity[0].at !== lastSeenAt;
  const accent = useAccentColor();
  const pendingBills = usePendingBills();
  const [retrying, setRetrying] = useState(false);

  async function retrySync() {
    setRetrying(true);
    await syncPendingBills();
    setRetrying(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await authStore.hydrate();
      if (cancelled) return;
      if (!authStore.getCurrentUser()) {
        navigate({ to: "/login" });
      } else {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!ready) return;
    if (!user || user.status !== "Active") {
      void authStore.logout();
      navigate({ to: "/login" });
    }
  }, [ready, user, navigate]);

  // Periodically check whether another device has logged in as this same user — if so,
  // this device's session was taken over, so log out here too (locally only — the new
  // device's claim must not be released) and explain why, rather than leaving this
  // session silently acting as if it's still authenticated.
  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    async function check() {
      const stillMine = await authStore.isSessionStillMine();
      if (cancelled || stillMine) return;
      authStore.clearLocalSession();
      toast.error("You were logged out because this account signed in on another device.");
      navigate({ to: "/login" });
    }
    const id = setInterval(check, 7000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ready, user, navigate]);

  async function logout() {
    if (pendingSaleStore.get()) {
      toast.error("Finish or discard the current sale before logging out.");
      return;
    }
    if (user) logAudit(user.name, "logout", "Session");
    await authStore.logout();
    navigate({ to: "/login" });
  }

  if (!ready || !user) {
    return <div className="min-h-screen bg-muted/40" />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted/40">
        <AppSidebar />
        {/* min-w-0 overrides the flex item's default min-width:auto — without it, a wide
            table/content on any page forces this whole column (and the page) to overflow
            horizontally instead of letting that page's own overflow-x-auto wrapper scroll it. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-3">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-3">
              {pendingBills.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                    >
                      <CloudOff className="h-4 w-4" />
                      {pendingBills.length} bill{pendingBills.length > 1 ? "s" : ""} pending sync
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80">
                    <DropdownMenuLabel>Saved locally, not yet synced</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <p className="px-2 pb-2 text-xs text-muted-foreground">
                      These sales were saved on this device because Supabase couldn't be reached.
                      They'll sync automatically once the connection is back.
                    </p>
                    {pendingBills.slice(0, 8).map((p) => (
                      <DropdownMenuItem
                        key={p.bill.number}
                        className="flex-col items-start gap-0.5"
                      >
                        <p className="text-sm text-foreground">
                          {p.bill.number} — {settingsStore.get().general.currency}{" "}
                          {p.bill.total.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Queued {p.queuedAt.slice(0, 16).replace("T", " ")}
                          {p.attempts > 0 ? ` — retried ${p.attempts}x` : ""}
                        </p>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <div className="p-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5"
                        disabled={retrying}
                        onClick={retrySync}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
                        {retrying ? "Syncing..." : "Retry now"}
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {register.register && (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/pos/register">
                    <Store className="h-4 w-4" /> View Register
                  </Link>
                </Button>
              )}
              <DropdownMenu
                onOpenChange={(open) => {
                  if (open && activity.length > 0) lastSeenStore.set(activity[0].at);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button className="relative">
                    <Inbox className="h-5 w-5 text-muted-foreground" />
                    {hasUnseen && (
                      <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel>Recent Activity</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {activity.length === 0 && (
                    <p className="px-2 py-3 text-center text-sm text-muted-foreground">
                      Nothing yet.
                    </p>
                  )}
                  {activity.slice(0, 10).map((entry, idx) => (
                    <DropdownMenuItem key={idx} className="flex-col items-start gap-0.5">
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{entry.user}</span>{" "}
                        <span className="text-muted-foreground">{actionLabels[entry.action]}</span>{" "}
                        {entry.object}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.at}</p>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-destructive text-xs font-semibold text-destructive-foreground">
                        {user.name.trim()[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden leading-tight sm:block">
                      <p className="text-sm font-semibold text-foreground">{user.name}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {register.storeName}
                      </p>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
                    <p className="text-xs font-normal text-muted-foreground">{user.role}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/my-profile">
                      <UserCircle className="mr-2 h-4 w-4" /> My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Theme Color</p>
                    <div className="grid w-40 grid-cols-6 gap-1.5">
                      {accentColors.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          aria-label={c.label}
                          title={c.label}
                          onClick={() => setAccentColor(c.id)}
                          className={cn(
                            "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                            accent === c.id ? "border-foreground" : "border-transparent",
                          )}
                          style={{ backgroundColor: c.swatch }}
                        />
                      ))}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" /> Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1">
            {title && <span className="sr-only">{title}</span>}
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
