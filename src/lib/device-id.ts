const KEY = "dhipos-device-id";

// A stable id for this browser/device, shared across every tab of the same browser
// profile (via localStorage) but distinct from every other device. Used server-side to
// enforce "only one register open per device" even across multiple tabs, which the
// per-tab in-memory register pointer alone can't catch (each tab's JS module state is
// independent — only localStorage is shared, and this app doesn't live-sync across tabs).
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}
