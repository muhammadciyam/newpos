// The internal identifier for a register is a composite of its outlet and display name, so
// the same display name (e.g. "Counter 1") can be reused across different outlets without
// colliding — only within one outlet does the name need to stay unique. Zero dependencies
// so both client and server register code can import it safely.
export function registerKey(outletId: string, displayName: string): string {
  return `${outletId}::${displayName.trim()}`;
}
