// One consistent colored badge per semantic meaning, reused everywhere an icon needs a
// "what kind of thing is this" color — not per-instance, so the same color always means the
// same thing across the app (sales=blue, growth=emerald, credit=amber, etc.).
export const iconColors = {
  blue: "bg-blue-100 text-blue-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  indigo: "bg-indigo-100 text-indigo-600",
  pink: "bg-pink-100 text-pink-600",
  cyan: "bg-cyan-100 text-cyan-600",
  rose: "bg-rose-100 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
  orange: "bg-orange-100 text-orange-600",
  teal: "bg-teal-100 text-teal-600",
  purple: "bg-purple-100 text-purple-600",
} as const;
export type IconColor = keyof typeof iconColors;
