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
  ShieldPlus,
  ChevronDown,
  LifeBuoy,
  ChevronRight,
  MessageCircle,
  ShoppingCart,
  CircleDollarSign,
  History,
  FileText,
  CreditCard,
  Receipt,
  ClipboardList,
  ClipboardCheck,
  TrendingUp,
  Package,
  Percent,
  Gift,
  Printer,
  Plug,
  Bell,
  ScrollText,
  IdCard,
  MapPin,
  UserCog,
  SlidersHorizontal,
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
import { useRegister, formatOpenSince, registerDisplayName } from "@/lib/register-store";
import { useCurrentUser } from "@/lib/auth-store";
import { hasPermission, type Permission } from "@/lib/permissions";
import { useCustomRoles } from "@/lib/custom-roles-store";
import { iconColors, type IconColor } from "@/lib/icon-colors";
import { cn } from "@/lib/utils";

// Leaves with no `permission` are shown to everyone — that's only correct as long as the
// page behind them truly has no access gate of its own (e.g. the still-inert Loyalty
// Programs / Integrations / Notification placeholders). Any leaf whose page calls
// useHasPermission(...) or checks role directly must list that same permission here, or
// it'll show in the sidebar for users the page itself then blocks with RestrictedPage.
type NavLeaf = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: IconColor;
  permission?: Permission;
};
type NavItem = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  color: IconColor;
  url?: string;
  permission?: Permission;
  children?: NavLeaf[];
};

const items: NavItem[] = [
  // Sales figures aren't a Cashier's business — same permission that already gates
  // Reports/Analytics, so Home is hidden here too and index.tsx redirects a Cashier who
  // still lands on "/" (e.g. as the post-login default) straight to the Sell page instead.
  { title: "Home", url: "/", icon: Home, color: "blue", permission: "reports.view" },
  {
    title: "Point of Sale",
    icon: Monitor,
    color: "emerald",
    children: [
      { title: "Sell", url: "/pos/sell", icon: ShoppingCart, color: "emerald" },
      { title: "Register", url: "/pos/register", icon: CircleDollarSign, color: "blue" },
      { title: "Register Sessions", url: "/pos/register-sessions", icon: History, color: "violet" },
      { title: "Quotations", url: "/pos/quotations", icon: FileText, color: "amber" },
      { title: "Online Payments", url: "/pos/online-payments", icon: CreditCard, color: "cyan" },
      { title: "Bill History", url: "/pos/bill-history", icon: Receipt, color: "rose" },
    ],
  },
  { title: "Customers", url: "/customers", icon: Users, color: "pink" },
  { title: "Products", url: "/products", icon: Tags, color: "amber" },
  {
    title: "Inventory",
    icon: Database,
    color: "indigo",
    children: [
      { title: "Purchase Invoices", url: "/inventory", icon: ClipboardList, color: "indigo" },
      { title: "Stock Count", url: "/stock-count", icon: ClipboardCheck, color: "teal" },
    ],
  },
  { title: "Wholesaler", url: "/supply/home", icon: Store, color: "violet" },
  { title: "Expenses", url: "/expenses", icon: Wallet, color: "rose" },
  { title: "Reports", url: "/reports", icon: Calculator, color: "cyan" },
  {
    title: "Analytics",
    icon: BarChart3,
    color: "teal",
    children: [
      { title: "Sales", url: "/analytics/sales", icon: TrendingUp, color: "emerald" },
      { title: "Inventory", url: "/analytics/inventory", icon: Package, color: "amber" },
    ],
  },
  { title: "Super Admin", url: "/admin/super-admin", icon: ShieldPlus, color: "orange" },
  {
    title: "Admin",
    icon: Settings,
    color: "slate",
    children: [
      {
        title: "Billing",
        url: "/admin/billing",
        icon: CreditCard,
        color: "cyan",
        permission: "settings.manage",
      },
      {
        title: "Settings",
        url: "/admin/settings",
        icon: SlidersHorizontal,
        color: "slate",
        permission: "settings.manage",
      },
      {
        title: "Users",
        url: "/admin/users",
        icon: UserCog,
        color: "blue",
        permission: "users.manage",
      },
      {
        title: "Employees",
        url: "/admin/employees",
        icon: IdCard,
        color: "pink",
        permission: "users.manage",
      },
      {
        title: "Locations",
        url: "/admin/locations",
        icon: MapPin,
        color: "rose",
        permission: "outlets.manage",
      },
      {
        title: "Taxes",
        url: "/admin/taxes",
        icon: Percent,
        color: "amber",
        permission: "settings.manage",
      },
      { title: "Loyalty Programs", url: "/admin/loyalty-programs", icon: Gift, color: "violet" },
      {
        title: "Print Templates",
        url: "/admin/print-templates",
        icon: Printer,
        color: "indigo",
        permission: "settings.manage",
      },
      { title: "Integrations", url: "/admin/integrations", icon: Plug, color: "teal" },
      { title: "Notification", url: "/admin/notification", icon: Bell, color: "orange" },
      {
        title: "Audit Logs",
        url: "/admin/audit-logs",
        icon: ScrollText,
        color: "purple",
        permission: "settings.manage",
      },
    ],
  },
];

// Small colored badge behind each nav icon — same palette/meaning-per-color convention as
// the dashboard's stat cards (see icon-colors.ts), applied here per section instead of per
// stat so the sidebar reads as a set of distinct areas rather than one flat icon color.
function NavIcon({
  icon: Icon,
  color,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  color: IconColor;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md shadow-sm ring-1 ring-black/5",
        size === "md" ? "h-7 w-7" : "h-6 w-6",
        iconColors[color],
      )}
    >
      <Icon className={size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={2.25} />
    </span>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => (url === "/" ? pathname === "/" : pathname.startsWith(url));
  const register = useRegister();
  const currentUser = useCurrentUser();
  // Warms/subscribes to the custom-roles cache that hasPermission() reads synchronously below.
  useCustomRoles();

  // "Super Admin" is hidden from everyone else via a direct role check (not a Permission —
  // Super Admin sits outside the normal permission matrix). Every other top-level item is
  // filtered by whether the user has each child leaf's required permission; a group whose
  // children are all hidden is dropped entirely rather than showing an empty dropdown.
  const visibleItems = items
    .filter((item) => item.title !== "Super Admin" || currentUser?.role === "Super Admin")
    .filter((item) => !item.permission || hasPermission(currentUser?.role, item.permission))
    .map((item) =>
      item.children
        ? {
            ...item,
            children: item.children.filter(
              (c) => !c.permission || hasPermission(currentUser?.role, c.permission),
            ),
          }
        : item,
    )
    .filter((item) => !item.children || item.children.length > 0);

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
        <div className="flex items-center justify-center px-2 py-2.5">
          {collapsed ? (
            // Rail too narrow for the wordmark — same compact mark used for the favicon.
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <img src="/icon.png" alt="Dhipos" className="h-10 w-10 object-contain" />
            </div>
          ) : (
            // Full wordmark, same treatment as the login screen but a little larger — it
            // already reads "Dhipos", so no separate text label, just the version inline
            // right after it.
            <div className="flex items-end gap-1.5">
              <img src="/logo.png" alt="Dhipos" className="h-16 w-auto" />
              <span className="pb-1 text-[11px] font-medium tracking-wide text-sidebar-foreground/50">
                v1.0
              </span>
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
                <p className="mt-1 text-[11px] uppercase tracking-wide text-primary-foreground/70">
                  Register
                </p>
                <p className="text-sm font-semibold">
                  {registerDisplayName(register.registers, register.register)}
                </p>
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
              {visibleItems.map((item) => {
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
                          <NavIcon icon={item.icon} color={item.color} />
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
                          <NavIcon icon={item.icon} color={item.color} />
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
                                  <Link to={child.url} className="flex items-center gap-2">
                                    <NavIcon icon={child.icon} color={child.color} size="sm" />
                                    <span>{child.title}</span>
                                  </Link>
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
      <SidebarFooter className="flex flex-col gap-1.5 border-t border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            <LifeBuoy className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm font-medium text-sidebar-foreground">Need Help?</p>
          </div>
        )}
        <a
          href="https://wa.me/9607333555"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg border border-sidebar-border p-2.5 text-left transition hover:bg-sidebar-accent"
        >
          <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          {!collapsed && (
            <p className="flex-1 text-xs font-medium text-emerald-600">Chat on WhatsApp</p>
          )}
          {!collapsed && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </a>
        <a
          href="viber://chat?number=%2B9607799190"
          className="flex items-center gap-2 rounded-lg border border-sidebar-border p-2.5 text-left transition hover:bg-sidebar-accent"
        >
          <MessageCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
          {!collapsed && (
            <p className="flex-1 text-xs font-medium text-purple-600">Chat on Viber</p>
          )}
          {!collapsed && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
