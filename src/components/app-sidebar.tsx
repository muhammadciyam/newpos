import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  Home,
  Monitor,
  Users,
  Tags,
  Database,
  Store,
  Wallet,
  Calculator,
  BarChart3,
  Settings,
  BookText,
  ChevronDown,
  LifeBuoy,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useRegister, formatOpenSince } from "@/lib/register-store";

type NavLeaf = { title: string; url: string };
type NavItem = { title: string; icon: React.ComponentType<{ className?: string }>; url?: string; children?: NavLeaf[] };

const items: NavItem[] = [
  { title: "Home", url: "/", icon: Home },
  {
    title: "Point of Sale",
    icon: Monitor,
    children: [
      { title: "Sell", url: "/pos/sell" },
      { title: "Register", url: "/pos/register" },
      { title: "Register Sessions", url: "/pos/register-sessions" },
      { title: "Quotations", url: "/pos/quotations" },
      { title: "Online Payments", url: "/pos/online-payments" },
      { title: "Bill History", url: "/pos/bill-history" },
    ],
  },
  { title: "Customers", url: "/customers", icon: Users },
  { title: "Products", url: "/products", icon: Tags },
  {
    title: "Inventory",
    icon: Database,
    children: [
      { title: "Purchase Invoices", url: "/inventory" },
      { title: "Stock Count", url: "/stock-count" },
    ],
  },
  { title: "Supply", url: "/supply/home", icon: Store },
  { title: "Expenses", url: "/expenses", icon: Wallet },
  { title: "Reports", url: "/reports", icon: Calculator },
  {
    title: "Analytics",
    icon: BarChart3,
    children: [
      { title: "Sales", url: "/analytics/sales" },
      { title: "Inventory", url: "/analytics/inventory" },
    ],
  },
  {
    title: "Admin",
    icon: Settings,
    children: [
      { title: "Billing", url: "/admin/billing" },
      { title: "Settings", url: "/admin/settings" },
      { title: "Users", url: "/admin/users" },
      { title: "Employees", url: "/admin/employees" },
      { title: "Locations", url: "/admin/locations" },
      { title: "Taxes", url: "/admin/taxes" },
      { title: "Loyalty Programs", url: "/admin/loyalty-programs" },
      { title: "Print Templates", url: "/admin/print-templates" },
      { title: "Integrations", url: "/admin/integrations" },
      { title: "Notification", url: "/admin/notification" },
      { title: "Audit Logs", url: "/admin/audit-logs" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));
  const register = useRegister();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of items) {
      if (item.children) initial[item.title] = item.children.some((c) => isActive(c.url));
    }
    return initial;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-elegant)]">
            <BookText className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-tight text-sidebar-foreground">Dhipos</span>
              <span className="text-xs text-sidebar-foreground/60">/ v14.35</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <Link
            to="/pos/register"
            className="block rounded-lg bg-primary px-3 py-2.5 text-primary-foreground transition hover:brightness-110"
          >
            {register.register ? (
              <>
                <p className="text-sm font-bold">{register.storeName}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-primary-foreground/70">Register</p>
                <p className="text-sm font-semibold">{register.register}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-primary-foreground/70">
                  Register Open Since
                </p>
                <p className="text-sm font-semibold">
                  {register.openedAt ? formatOpenSince(Date.now() - register.openedAt) : "—"} ago
                </p>
              </>
            ) : (
              <p className="text-center text-sm font-semibold">No Open Register</p>
            )}
          </Link>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                if (!item.children) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(item.url!)}
                        tooltip={item.title}
                        className="border-l-2 border-transparent data-[active=true]:border-primary"
                      >
                        <Link to={item.url!} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const groupActive = item.children.some((c) => isActive(c.url));
                const open = collapsed ? groupActive : (openGroups[item.title] ?? groupActive);

                return (
                  <Collapsible
                    key={item.title}
                    open={open}
                    onOpenChange={(v) => setOpenGroups((s) => ({ ...s, [item.title]: v }))}
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={groupActive && !open}
                          tooltip={item.title}
                          className="border-l-2 border-transparent data-[active=true]:border-primary"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && (
                            <>
                              <span>{item.title}</span>
                              <ChevronDown
                                className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                              />
                            </>
                          )}
                          {collapsed && <ChevronRight className="ml-auto h-3 w-3 shrink-0" />}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      {!collapsed && (
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.children.map((child) => (
                              <SidebarMenuSubItem key={child.url}>
                                <SidebarMenuSubButton asChild isActive={isActive(child.url)}>
                                  <Link to={child.url}>{child.title}</Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <a
          href="https://wa.me/9607333555"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-sidebar-border p-2.5 text-left transition hover:bg-sidebar-accent"
        >
          <LifeBuoy className="h-5 w-5 shrink-0 text-muted-foreground" />
          {!collapsed && (
            <div className="flex-1">
              <p className="text-sm font-medium text-sidebar-foreground">Need Help?</p>
              <p className="text-xs font-medium text-emerald-600">Chat on WhatsApp</p>
            </div>
          )}
          {!collapsed && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
