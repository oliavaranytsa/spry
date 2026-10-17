import { describe, expect, it } from "vitest";

import { groupByWeek, startOfWeek } from "@/lib/weeks";

// Saturday 17 October 2026, local time.
const NOW = new Date(2026, 9, 17, 16, 0);
const at = (y: number, m: number, d: number, h = 10) =>
  new Date(y, m - 1, d, h).toISOString();

describe("startOfWeek", () => {
  it("goes back to Monday, and keeps Monday as is", () => {
    expect(startOfWeek(NOW)).toEqual(new Date(2026, 9, 12));
    expect(startOfWeek(new Date(2026, 9, 12, 9))).toEqual(
      new Date(2026, 9, 12),
    );
    expect(startOfWeek(new Date(2026, 9, 18, 23))).toEqual(
      new Date(2026, 9, 12),
    );
  });
});

describe("groupByWeek", () => {
  it("puts upcoming weeks first and folds the past at the end", () => {
    const meetings = [
      { id: "a", starts_at: at(2026, 10, 1) },
      { id: "b", starts_at: at(2026, 10, 9) },
      { id: "c", starts_at: at(2026, 10, 13) },
      { id: "d", starts_at: at(2026, 10, 21) },
      { id: "e", starts_at: at(2026, 11, 3) },
    ];
    const groups = groupByWeek(meetings, NOW);
    expect(groups.map((g) => [g.key, g.items.map((m) => m.id)])).toEqual([
      ["this", ["c"]],
      ["next", ["d"]],
      ["later", ["e"]],
      ["earlier", ["b", "a"]],
    ]);
  });

  it("leaves out empty weeks", () => {
    const groups = groupByWeek([{ starts_at: at(2026, 10, 18) }], NOW);
    expect(groups.map((g) => g.key)).toEqual(["this"]);
  });
});
