// Groups meetings into weeks, in the browser's time zone. Weeks start on
// Monday, as ISO weeks and the weekly report do.

export type WeekKey = "this" | "next" | "later" | "earlier";

export interface WeekGroup<T> {
  key: WeekKey;
  label: string;
  range: string;
  items: T[];
}

const DAY = 24 * 60 * 60 * 1000;

export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (d.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  d.setDate(d.getDate() - sinceMonday);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function range(from: Date, toExclusive: Date): string {
  return `${shortDate(from)} – ${shortDate(new Date(toExclusive.getTime() - DAY))}`;
}

/** Upcoming weeks first (this, next, later), then everything earlier. */
export function groupByWeek<T extends { starts_at: string }>(
  items: T[],
  now: Date = new Date(),
): WeekGroup<T>[] {
  const thisWeek = startOfWeek(now);
  const nextWeek = addDays(thisWeek, 7);
  const afterNext = addDays(thisWeek, 14);

  const groups: Record<WeekKey, WeekGroup<T>> = {
    this: {
      key: "this",
      label: "This week",
      range: range(thisWeek, nextWeek),
      items: [],
    },
    next: {
      key: "next",
      label: "Next week",
      range: range(nextWeek, afterNext),
      items: [],
    },
    later: {
      key: "later",
      label: "Later",
      range: `from ${shortDate(afterNext)}`,
      items: [],
    },
    earlier: {
      key: "earlier",
      label: "Earlier",
      range: `before ${shortDate(thisWeek)}`,
      items: [],
    },
  };

  for (const item of items) {
    const start = new Date(item.starts_at);
    const key: WeekKey =
      start < thisWeek
        ? "earlier"
        : start < nextWeek
          ? "this"
          : start < afterNext
            ? "next"
            : "later";
    groups[key].items.push(item);
  }

  // Earlier meetings newest first: last week is more interesting than last year.
  groups.earlier.items.reverse();

  return (["this", "next", "later", "earlier"] as WeekKey[])
    .map((k) => groups[k])
    .filter((g) => g.items.length > 0);
}
