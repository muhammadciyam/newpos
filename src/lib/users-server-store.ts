import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppUser } from "@/lib/auth-store";

// Server-only. Never import this from a client component or from auth-store.ts's
// client-facing exports — it must stay out of the client bundle. Only users-api.ts
// (the createServerFn boundary) should import it.
//
// This is the canonical account directory. Before this existed, accounts lived only in
// whichever browser's localStorage created them — a user created on one device simply
// didn't exist from any other device's point of view, so they could never log in
// anywhere else. Moving it here is what makes a newly created account work from any
// device, the same fix already applied to registers and login sessions.

const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "users-state.json");

const seedAdmin: AppUser = {
  id: "seed-admin",
  name: "Owner",
  email: "siyante003@gmail.com",
  username: "siyante003",
  password: "229022#",
  role: "Super Admin",
  status: "Active",
  authorizedRegister: null,
  createdAt: new Date("2026-07-13T07:00:00").toISOString(),
  photo: null,
  phone: "",
  jobTitle: "Owner",
  department: "",
  hireDate: "",
  employmentStatus: "Active",
  salary: null,
  payType: "Monthly",
  nationalId: "",
  address: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  idCardPhoto: null,
  certificates: [],
};

function loadFromDisk(): AppUser[] | null {
  try {
    if (!existsSync(DATA_FILE)) return null;
    return JSON.parse(readFileSync(DATA_FILE, "utf-8")) as AppUser[];
  } catch {
    return null;
  }
}

function persistToDisk() {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(state), "utf-8");
  } catch {
    // Best-effort — in-memory state is still correct even if the write fails.
  }
}

let state: AppUser[] = loadFromDisk() ?? [seedAdmin];

export function getServerUsers(): AppUser[] {
  return state;
}

export function mutateServerUsers(mutator: (users: AppUser[]) => AppUser[]): AppUser[] {
  state = mutator(state);
  persistToDisk();
  return state;
}
