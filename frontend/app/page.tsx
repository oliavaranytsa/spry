"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { useAuth } from "react-oidc-context";

import { AuthStatus } from "@/components/auth-status";
import { MeetingCard } from "@/components/meeting-card";
import { SpryMascot } from "@/components/spry-mascot";
import { Sticker } from "@/components/stickers";
import { ThemeToggle } from "@/components/theme-toggle";
import { WakingUp } from "@/components/waking-up";
import type { Meeting } from "@/lib/meetings";
import { groupByWeek } from "@/lib/weeks";

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

  const field =
    "w-full px-3 py-2.5 text-sm bg-paper border-2 border-ink rounded-xl text-ink placeholder:text-ink/40 focus:outline-none focus:ring-4 focus:ring-lime";
  const label =
    "block text-xs font-bold text-ink uppercase tracking-wider mb-1.5";

  const groups = groupByWeek(meetings);
  const thisWeekCount = groups.find((g) => g.key === "this")?.items.length ?? 0;
  const upcomingCount = groups
    .filter((g) => g.key !== "earlier")
    .reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="bg-ink text-cream">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SpryMascot className="w-11 h-11" />
            <div>
              <h1 className="font-display text-2xl font-extrabold leading-none tracking-tight">
                Peach
              </h1>
              <p className="text-[11px] text-cream/70 mt-0.5">
                meetings, sorted
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <AuthStatus />
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-10 pb-2 flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink/60">
            This week and beyond
          </p>
          <h2 className="relative font-display text-4xl md:text-5xl font-extrabold leading-[1.05] mt-2">
            {signedOut
              ? "Sign in, and let's get your week in order."
              : thisWeekCount > 0
                ? `${thisWeekCount} ${thisWeekCount === 1 ? "meeting" : "meetings"} this week.`
                : upcomingCount > 0
                  ? `A clear week. ${upcomingCount} coming up.`
                  : "A clear week. Plan something?"}
          </h2>
        </div>
        <div className="relative hidden md:block w-56 h-36 shrink-0 -mb-2">
          <Sticker
            kind="bubble"
            className="absolute -top-6 left-0 w-24 h-24"
            rotate={-8}
          />
          <SpryMascot className="absolute bottom-0 right-6 w-28 h-28 -rotate-6" />
          <Sticker
            kind="coffee"
            className="absolute bottom-0 left-6 w-14 h-14"
            rotate={10}
          />
          <Sticker
            kind="sparkle"
            className="absolute -top-4 right-0 w-10 h-10"
            rotate={15}
          />
        </div>
      </section>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: Schedule Form */}
        <div className="md:col-span-1">
          <div className="relative bg-paper p-6 rounded-3xl border-2 border-ink shadow-sticker sticky top-8">
            <Sticker
              kind="heart"
              className="absolute -top-5 -right-4 w-12 h-12"
              rotate={14}
            />
            <Sticker
              kind="clock"
              className="absolute -bottom-6 -left-5 w-12 h-12"
              rotate={-12}
            />
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
            <WakingUp />
          ) : meetings.length === 0 ? (
            <div className="p-10 text-center bg-paper border-2 border-dashed border-ink rounded-3xl">
              <SpryMascot className="w-24 h-24 mx-auto mb-3" />
              <Sticker
                kind="rainbow"
                className="w-20 h-20 mx-auto -mt-2 mb-1"
              />
              <h3 className="font-display font-extrabold text-xl mb-1">
                No meetings yet
              </h3>
              <p className="text-sm text-ink/70">
                Use the form to schedule your first meeting.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map((g) => {
                const header = (
                  <div className="flex items-baseline gap-3">
                    <span
                      className={`font-display font-extrabold text-lg px-3 py-0.5 rounded-full border-2 border-ink ${
                        g.key === "this" ? "bg-lime" : "bg-paper"
                      }`}
                    >
                      {g.label}
                    </span>
                    <span className="text-xs font-bold text-ink/60">
                      {g.range} · {g.items.length}{" "}
                      {g.items.length === 1 ? "meeting" : "meetings"}
                    </span>
                  </div>
                );
                const cards = (
                  <div className="grid gap-5 mt-4">
                    {g.items.map((m) => (
                      <MeetingCard
                        key={m.id}
                        meeting={m}
                        token={token}
                        onChanged={(changed) =>
                          setMeetings((list) =>
                            list
                              .map((x) => (x.id === changed.id ? changed : x))
                              .sort((p, q) =>
                                p.starts_at.localeCompare(q.starts_at),
                              ),
                          )
                        }
                        onDeleted={(id) =>
                          setMeetings((list) => list.filter((x) => x.id !== id))
                        }
                      />
                    ))}
                  </div>
                );
                // Past weeks fold away so the board shows what is coming.
                return g.key === "earlier" ? (
                  <details key={g.key} className="group">
                    <summary className="cursor-pointer list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                      {header}
                      <span className="text-xs font-bold text-ink underline underline-offset-4 group-open:hidden">
                        show
                      </span>
                    </summary>
                    <div className="opacity-80">{cards}</div>
                  </details>
                ) : (
                  <section key={g.key}>
                    {header}
                    {cards}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
