import { useCurrentUser } from "@/lib/auth-store";

// Which outlet a user's view of data (registers, sales, reports) should be restricted to.
// null means "no restriction, see everything across every outlet" — true for Super Admin,
// and (as a safe default so nobody gets silently locked out) for any user with no outlet
// assigned yet.
export function scopeOutletIdFor(
  user: { role: string; outletId: string | null } | null,
): string | null {
  if (!user) return null;
  if (user.role === "Super Admin") return null;
  return user.outletId ?? null;
}

export function useScopeOutletId(): string | null {
  const user = useCurrentUser();
  return scopeOutletIdFor(user);
}
