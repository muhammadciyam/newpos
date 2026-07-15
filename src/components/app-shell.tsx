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
import { Inbox, Store, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useRegister } from "@/lib/register-store";
import { authStore, useCurrentUser } from "@/lib/auth-store";
import { logAudit } from "@/lib/audit-log-store";
import { pendingSaleStore } from "@/lib/pending-sale-store";

export function AppShell({ title, children }: { title?: string; children: ReactNode }) {
  const register = useRegister();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

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
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-3">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-3">
              {register.register && (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to="/pos/register">
                    <Store className="h-4 w-4" /> View Register
                  </Link>
                </Button>
              )}
              <button onClick={() => toast("No new messages")} className="relative">
                <Inbox className="h-5 w-5 text-muted-foreground" />
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              </button>
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
