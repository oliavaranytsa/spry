// The meetings API, as the board uses it: change a meeting, delete one.
// (Listing and creating stay in app/page.tsx, where the form lives.)

import type { Agenda } from "@/lib/agenda";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Meeting {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  attendee_count: number;
  agenda: Agenda | null;
}

export interface MeetingFields {
  title: string;
  starts_at: string; // ISO 8601
  ends_at: string;
  attendee_count: number;
}

async function failure(res: Response, fallback: string): Promise<Error> {
  if (res.status === 401) {
    return new Error("Your session has expired. Please sign in again.");
  }
  if (res.status === 404) {
    return new Error("This meeting no longer exists. Refresh the board.");
  }
  const data = await res.json().catch(() => ({}));
  const detail = Array.isArray(data.detail)
    ? data.detail.map((d: { msg?: string }) => d.msg).join("; ")
    : data.detail;
  return new Error(detail || fallback);
}

export async function updateMeeting(
  id: string,
  fields: MeetingFields,
  token: string,
): Promise<Meeting> {
  const res = await fetch(`${API_URL}/api/meetings/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw await failure(res, "Could not save the meeting.");
  return (await res.json()) as Meeting;
}

export async function deleteMeeting(id: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/meetings/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw await failure(res, "Could not delete the meeting.");
  }
}

/** ISO string → the value a <input type="datetime-local"> expects. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Where a meeting is in time, for the pill on its card. */
export function timeStatus(
  startsAt: string,
  endsAt: string,
  now: Date = new Date(),
): { label: string; tone: "now" | "soon" | "upcoming" | "done" } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (end <= now) return { label: "Done", tone: "done" };
  if (start <= now) return { label: "Now", tone: "now" };

  const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
  if (minutes < 60) return { label: `In ${minutes} min`, tone: "soon" };

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const days = Math.round((startDay.getTime() - today.getTime()) / 86400000);
  if (days === 0)
    return { label: `Today · in ${Math.round(minutes / 60)} h`, tone: "soon" };
  if (days === 1) return { label: "Tomorrow", tone: "upcoming" };
  return { label: `In ${days} days`, tone: "upcoming" };
}
