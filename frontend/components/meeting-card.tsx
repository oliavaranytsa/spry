"use client";

import { useState } from "react";
import { Clock, Pencil, Trash2, Users } from "lucide-react";

import { AgendaPanel } from "@/components/agenda-panel";
import type { Agenda } from "@/lib/agenda";
import {
  deleteMeeting,
  timeStatus,
  toLocalInput,
  updateMeeting,
  type Meeting,
} from "@/lib/meetings";

const day = (iso: string) => new Date(iso).getDate();
const month = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short" });
const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

const TONES = {
  now: "bg-coral text-ink animate-pulse",
  soon: "bg-lime text-ink",
  upcoming: "bg-paper text-ink",
  done: "bg-ink-soft text-ink/60",
} as const;

const field =
  "w-full px-3 py-2 text-sm bg-paper border-2 border-ink rounded-xl text-ink placeholder:text-ink/40 focus:outline-none focus:ring-4 focus:ring-lime";
const label =
  "block text-[11px] font-bold text-ink uppercase tracking-wider mb-1";
const iconButton =
  "w-8 h-8 shrink-0 flex items-center justify-center rounded-full border-2 border-ink bg-paper hover:bg-ink-soft transition-colors disabled:opacity-40";

export function MeetingCard({
  meeting: m,
  token,
  onChanged,
  onDeleted,
}: {
  meeting: Meeting;
  token: string | undefined;
  onChanged: (meeting: Meeting) => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm-delete">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The edit form, filled from the meeting when it opens.
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [attendees, setAttendees] = useState(1);

  const status = timeStatus(m.starts_at, m.ends_at);

  const startEdit = () => {
    setTitle(m.title);
    setStartsAt(toLocalInput(m.starts_at));
    setEndsAt(toLocalInput(m.ends_at));
    setAttendees(m.attendee_count);
    setError(null);
    setMode("edit");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("End time must be later than start time.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(
        await updateMeeting(
          m.id,
          {
            title: title.trim(),
            starts_at: new Date(startsAt).toISOString(),
            ends_at: new Date(endsAt).toISOString(),
            attendee_count: attendees,
          },
          token,
        ),
      );
      setMode("view");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMeeting(m.id, token);
      onDeleted(m.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete.");
      setBusy(false);
    }
  };

  return (
    <article
      className={`bg-paper p-5 rounded-3xl border-2 border-ink shadow-sticker transition-transform hover:-translate-y-0.5 ${
        status.tone === "done" ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-16 rounded-2xl bg-ink text-cream text-center py-2 border-2 border-ink">
          <div className="text-[10px] font-bold uppercase tracking-wider text-lime">
            {weekday(m.starts_at)}
          </div>
          <div className="font-display text-3xl font-extrabold leading-none">
            {day(m.starts_at)}
          </div>
          <div className="text-[11px] font-bold uppercase">
            {month(m.starts_at)}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {mode === "edit" ? (
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className={label}>Title</label>
                <input
                  required
                  maxLength={255}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={field}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Starts at</label>
                  <input
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Ends at</label>
                  <input
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className={field}
                  />
                </div>
              </div>
              <div className="w-32">
                <label className={label}>Attendees</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={attendees}
                  onChange={(e) =>
                    setAttendees(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className={field}
                />
              </div>
              {error && (
                <p className="p-2.5 text-xs font-semibold bg-coral-soft text-ink border-2 border-coral rounded-xl">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className="text-xs font-bold border-2 border-ink bg-paper hover:bg-ink-soft px-4 py-2 rounded-full"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="text-xs font-display font-extrabold bg-lime text-ink px-5 py-2 rounded-full border-2 border-ink shadow-sticker-sm hover:shadow-sticker transition-shadow disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display font-extrabold text-xl leading-tight break-words">
                  {m.title}
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border-2 border-ink ${TONES[status.tone]}`}
                  >
                    {status.label}
                  </span>
                  <button
                    onClick={startEdit}
                    disabled={!token}
                    className={iconButton}
                    aria-label="Edit meeting"
                    title="Edit meeting"
                  >
                    <Pencil className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                  <button
                    onClick={() => {
                      setError(null);
                      setMode("confirm-delete");
                    }}
                    disabled={!token}
                    className={`${iconButton} hover:bg-coral-soft`}
                    aria-label="Delete meeting"
                    title="Delete meeting"
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs font-semibold">
                <span className="flex items-center gap-1 bg-ink-soft px-2.5 py-1 rounded-full">
                  <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {time(m.starts_at)} – {time(m.ends_at)}
                </span>
                <span className="flex items-center gap-1 bg-ink-soft px-2.5 py-1 rounded-full">
                  <Users className="w-3.5 h-3.5" strokeWidth={2.5} />
                  {m.attendee_count}{" "}
                  {m.attendee_count === 1 ? "attendee" : "attendees"}
                </span>
              </div>

              {mode === "confirm-delete" && (
                <div className="mt-3 p-3 flex flex-wrap items-center justify-between gap-2 bg-coral-soft border-2 border-coral rounded-2xl">
                  <span className="text-sm font-semibold">
                    Delete “{m.title}” and its agenda? This cannot be undone.
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode("view")}
                      className="text-xs font-bold border-2 border-ink bg-paper px-3 py-1.5 rounded-full"
                    >
                      Keep
                    </button>
                    <button
                      onClick={remove}
                      disabled={busy}
                      className="text-xs font-bold border-2 border-ink bg-coral text-ink px-3 py-1.5 rounded-full disabled:opacity-50"
                    >
                      {busy ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              )}
              {error && mode !== "confirm-delete" && (
                <p className="mt-3 p-2.5 text-xs font-semibold bg-coral-soft text-ink border-2 border-coral rounded-xl">
                  {error}
                </p>
              )}
              {error && mode === "confirm-delete" && (
                <p className="mt-2 text-xs font-semibold text-ink">{error}</p>
              )}
            </>
          )}
        </div>
      </div>

      <AgendaPanel
        meetingId={m.id}
        agenda={m.agenda}
        token={token}
        onSaved={(agenda: Agenda) => onChanged({ ...m, agenda })}
      />
    </article>
  );
}
