import { format, subDays } from "date-fns";

export type DateRangePreset = "7d" | "30d" | "custom";

export type DateRangeParams = { range?: string; from?: string; to?: string };

export type ResolvedDateRange = {
  from: string;
  to: string;
  active: DateRangePreset;
};

/**
 * Turn `?range=7d|30d` or `?from=&to=` into a concrete `yyyy-MM-dd` window.
 * Explicit from/to wins; otherwise the last 7 days, which is the default the
 * pages open on.
 */
export function resolveRange(sp: DateRangeParams): ResolvedDateRange {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  if (sp.from && sp.to) return { from: sp.from, to: sp.to, active: "custom" };
  if (sp.range === "30d")
    return {
      from: format(subDays(today, 30), "yyyy-MM-dd"),
      to: todayStr,
      active: "30d",
    };
  return {
    from: format(subDays(today, 7), "yyyy-MM-dd"),
    to: todayStr,
    active: "7d",
  };
}
