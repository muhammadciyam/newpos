const KEY = "dhipos-device-id";
const TAB_KEY = "dhipos-tab-id";

// A stable id for this browser/device, shared across every tab of the same browser
// profile (via localStorage) but distinct from every other device. Used for login session
// takeover detection (claimSessionOnServer/checkSessionOnServer) and the Admin "Force
// Logout" / active-sessions view — things that are genuinely about "this physical
// device/browser," not any one tab, so this must stay stable across tabs and reloads.
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

// A per-TAB id (sessionStorage — not shared with other tabs, gone when the tab closes) used
// only to scope "this browser already has a register open" (see openRegisterOnServer /
// register-store.ts) to the one tab actually operating that register, rather than the whole
// browser. This is what lets one browser run two different outlets' registers side by side
// in two tabs — each tab presents a different id for this purpose, even though getDeviceId()
// above still (correctly) sees them as the same device for login/session purposes.
export function getTabId(): string {
  if (typeof window === "undefined") return "server";
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return "unknown-tab";
  }
}
