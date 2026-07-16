import { createPersistedStore, usePersistedStore } from "@/lib/persisted-store";

export type AccentColor =
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "purple"
  | "teal"
  | "rose"
  | "yellow"
  | "indigo"
  | "sky"
  | "lime"
  | "brown";

// Swatch preview colors only — the actual light/dark CSS variable overrides per accent
// live in styles.css as `:root[data-accent="..."]` / `.dark[data-accent="..."]` blocks,
// applied to <html> by the effect in __root.tsx. "blue" needs no override block since
// it's already the default in :root/.dark.
export const accentColors: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "blue", label: "Blue", swatch: "oklch(0.546 0.245 262.881)" },
  { id: "green", label: "Green", swatch: "oklch(0.546 0.16 145)" },
  { id: "red", label: "Red", swatch: "oklch(0.577 0.22 22)" },
  { id: "orange", label: "Orange", swatch: "oklch(0.68 0.18 55)" },
  { id: "purple", label: "Purple", swatch: "oklch(0.546 0.22 305)" },
  { id: "teal", label: "Teal", swatch: "oklch(0.546 0.13 200)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.577 0.22 350)" },
  { id: "yellow", label: "Yellow", swatch: "oklch(0.8 0.15 95)" },
  { id: "indigo", label: "Indigo", swatch: "oklch(0.546 0.2 280)" },
  { id: "sky", label: "Sky", swatch: "oklch(0.55 0.16 230)" },
  { id: "lime", label: "Lime", swatch: "oklch(0.75 0.17 120)" },
  { id: "brown", label: "Brown", swatch: "oklch(0.5 0.09 50)" },
];

// Per-device, not per-account — matches how every other UI preference in this app
// (last-seen inbox marker, etc.) is stored, and lets each user pick their own without
// needing any server round-trip or admin permission.
const accentStore = createPersistedStore<AccentColor>("dhipos-accent-color", "blue");

export function useAccentColor(): AccentColor {
  return usePersistedStore(accentStore);
}

export function setAccentColor(color: AccentColor) {
  accentStore.set(color);
}
