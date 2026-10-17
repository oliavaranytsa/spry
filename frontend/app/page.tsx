"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock, Plus, RefreshCw, Users } from "lucide-react";
import { useAuth } from "react-oidc-context";

import { AgendaPanel } from "@/components/agenda-panel";
import { AuthStatus } from "@/components/auth-status";
import { SpryMascot } from "@/components/spry-mascot";
import type { Agenda } from "@/lib/agenda";

interface Meeting {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  attendee_count: number;
  agenda: Agenda | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MeetingsPage() {
  const auth = useAuth();
  // The API answers 401 without this; see backend/app/auth.py.
  const token = auth.user?.access_token;
  const signedOut = !auth.isLoading && !auth.isAuthenticated;

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [attendeeCount, setAttendeeCount] = useState(1);

  const fetchMeetings = useCallback(async () => {
    if (!token) {
      // Nothing to ask the API for until someone signs in.
      setMeetings([]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/meetings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        throw new Error("Your session has expired. Please sign in again.");
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch meetings: ${res.statusText}`);
      }
      setMeetings(await res.json());
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load meetings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Wait until the stored session is read, then load (or clear) the list.
    if (auth.isLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMeetings();
  }, [auth.isLoading, fetchMeetings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError("Sign in to schedule a meeting.");
      return;
    }
    if (!title || !startsAt || !endsAt) {
      setError("Please fill in all required fields.");
      return;
    }

    const startIso = new Date(startsAt).toISOString();
    const endIso = new Date(endsAt).toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      setError("End time must be later than start time.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch(`${API_URL}/api/meetings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          starts_at: startIso,
          ends_at: endIso,
          attendee_count: Number(attendeeCount),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to create meeting");
      }

      // Reset form
      setTitle("");
      setStartsAt("");
      setEndsAt("");
      setAttendeeCount(1);
      // Reload meetings
      await fetchMeetings();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to create meeting");
    } finally {
      setSubmitting(false);
    }
  };

  const day = (isoStr: string) => new Date(isoStr).getDate();
  const month = (isoStr: string) =>
    new Date(isoStr).toLocaleDateString("en-US", { month: "short" });
  const weekday = (isoStr: string) =>
    new Date(isoStr).toLocaleDateString("en-US", { weekday: "short" });
  const formatTime = (isoStr: string) =>
    new Date(isoStr).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const field =
    "w-full px-3 py-2.5 text-sm bg-paper border-2 border-ink rounded-xl text-ink placeholder:text-ink/40 focus:outline-none focus:ring-4 focus:ring-lime";
  const label =
    "block text-xs font-bold text-ink uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="bg-ink text-cream">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SpryMascot className="w-11 h-11" />
            <div>
              <h1 className="font-display text-2xl font-extrabold leading-none tracking-tight">
                Spry
              </h1>
              <p className="text-[11px] text-cream/70 mt-0.5">
                meetings, sorted
              </p>
            </div>
          </div>
          <AuthStatus />
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-10 pb-2 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">
            This week and beyond
          </p>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold leading-[1.05] mt-2">
            {signedOut
              ? "Sign in, and let's get your week in order."
              : meetings.length === 0
                ? "A clear week. Plan something?"
                : `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"} on the board.`}
          </h2>
        </div>
        <SpryMascot className="hidden md:block w-28 h-28 shrink-0 -mb-2 -rotate-6" />
      </section>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: Schedule Form */}
        <div className="md:col-span-1">
          <div className="bg-paper p-6 rounded-3xl border-2 border-ink shadow-sticker sticky top-8">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-8 h-8 rounded-full bg-lime border-2 border-ink flex items-center justify-center">
                <Plus className="w-4 h-4" strokeWidth={3} />
              </span>
              <h2 className="font-display font-extrabold text-xl">
                New meeting
              </h2>
            </div>

            {error && (
              <div className="mb-4 p-3 text-xs bg-coral-soft text-ink border-2 border-coral rounded-xl">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={label}>Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Design Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={field}
                />
              </div>

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

              <div>
                <label className={label}>Attendees</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={attendeeCount}
                  onChange={(e) =>
                    setAttendeeCount(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className={field}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !token}
                className="w-full mt-2 bg-lime text-ink font-display font-extrabold text-base py-3 px-4 rounded-full border-2 border-ink shadow-sticker-sm hover:-translate-y-0.5 hover:shadow-sticker active:translate-y-0 active:shadow-none transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sticker-sm"
              >
                {submitting ? "Scheduling…" : "Schedule it"}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Meetings List */}
        <div className="md:col-span-2 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-extrabold text-2xl">
              On the board
              <span className="ml-2 align-middle text-sm font-bold bg-ink text-cream rounded-full px-2.5 py-0.5">
                {meetings.length}
              </span>
            </h2>
            <button
              onClick={fetchMeetings}
              className="flex items-center gap-1.5 text-xs font-bold text-ink border-2 border-ink rounded-full px-3 py-1.5 bg-paper hover:bg-lime transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} />
              Refresh
            </button>
          </div>

          {signedOut ? (
            <div className="p-10 text-center bg-paper border-2 border-dashed border-ink rounded-3xl">
              <SpryMascot className="w-24 h-24 mx-auto mb-3" />
              <h3 className="font-display font-extrabold text-xl mb-1">
                Sign in to see meetings
              </h3>
              <p className="text-sm text-ink/70 mb-5">
                The meetings API only answers signed-in users.
              </p>
              <Link
                href="/login"
                className="inline-block font-display font-extrabold bg-lime text-ink px-6 py-2.5 rounded-full border-2 border-ink shadow-sticker-sm hover:shadow-sticker transition-shadow"
              >
                Sign in
              </Link>
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-ink/70 bg-paper border-2 border-ink rounded-3xl">
              Loading meetings…
            </div>
          ) : meetings.length === 0 ? (
            <div className="p-10 text-center bg-paper border-2 border-dashed border-ink rounded-3xl">
              <SpryMascot className="w-24 h-24 mx-auto mb-3" />
              <h3 className="font-display font-extrabold text-xl mb-1">
                No meetings yet
              </h3>
              <p className="text-sm text-ink/70">
                Use the form to schedule your first meeting.
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {meetings.map((m) => (
                <article
                  key={m.id}
                  className="bg-paper p-5 rounded-3xl border-2 border-ink shadow-sticker"
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
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display font-extrabold text-xl leading-tight break-words">
                          {m.title}
                        </h3>
                        <span className="shrink-0 text-[11px] font-bold bg-lime text-ink px-2.5 py-1 rounded-full border-2 border-ink">
                          Confirmed
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs font-semibold">
                        <span className="flex items-center gap-1 bg-ink-soft px-2.5 py-1 rounded-full">
                          <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
                          {formatTime(m.starts_at)} – {formatTime(m.ends_at)}
                        </span>
                        <span className="flex items-center gap-1 bg-ink-soft px-2.5 py-1 rounded-full">
                          <Users className="w-3.5 h-3.5" strokeWidth={2.5} />
                          {m.attendee_count}{" "}
                          {m.attendee_count === 1 ? "attendee" : "attendees"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <AgendaPanel
                    meetingId={m.id}
                    agenda={m.agenda}
                    token={token}
                    onSaved={(agenda) =>
                      setMeetings((list) =>
                        list.map((x) => (x.id === m.id ? { ...x, agenda } : x)),
                      )
                    }
                  />
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
