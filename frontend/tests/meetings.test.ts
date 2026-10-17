import { describe, expect, it } from "vitest";

import { timeStatus, toLocalInput } from "@/lib/meetings";

const NOW = new Date(2026, 9, 17, 16, 0); // Saturday 17 October, 16:00 local
const iso = (d: number, h: number, m = 0) =>
  new Date(2026, 9, d, h, m).toISOString();

describe("timeStatus", () => {
  it("knows past, present and future", () => {
    expect(timeStatus(iso(17, 9), iso(17, 10), NOW)).toEqual({
      label: "Done",
      tone: "done",
    });
    expect(timeStatus(iso(17, 15), iso(17, 17), NOW).tone).toBe("now");
    expect(timeStatus(iso(17, 16, 30), iso(17, 17), NOW).label).toBe(
      "In 30 min",
    );
    expect(timeStatus(iso(17, 19), iso(17, 20), NOW).label).toBe(
      "Today · in 3 h",
    );
    expect(timeStatus(iso(18, 9), iso(18, 10), NOW).label).toBe("Tomorrow");
    expect(timeStatus(iso(22, 9), iso(22, 10), NOW).label).toBe("In 5 days");
  });
});

describe("toLocalInput", () => {
  it("formats for datetime-local inputs", () => {
    expect(toLocalInput(iso(7, 9, 5))).toBe("2026-10-07T09:05");
  });
});
