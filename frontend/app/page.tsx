"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Plus, Users } from "lucide-react";
import { useAuth } from "react-oidc-context";

import { AuthStatus } from "@/components/auth-status";

interface Meeting {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  attendee_count: number;
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

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Spry</h1>
              <p className="text-xs text-slate-500">Meeting Management</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Online
            </div>
            <AuthStatus />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: Schedule Form */}
        <div className="md:col-span-1">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm sticky top-8">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b">
              <Plus className="w-5 h-5 text-blue-600" />
              <h2 className="font-semibold text-base text-slate-800">
                New Meeting
              </h2>
            </div>

            {error && (
              <div className="mb-4 p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Design Sync"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Starts At
                </label>
                <input
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Ends At
                </label>
                <input
                  type="datetime-local"
                  required
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Attendees
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={attendeeCount}
                  onChange={(e) =>
                    setAttendeeCount(Math.max(1, parseInt(e.target.value) || 1))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !token}
                className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
              >
                {submitting ? "Scheduling..." : "Schedule Meeting"}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Meetings List */}
        <div className="md:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-slate-800">
              Scheduled Meetings ({meetings.length})
            </h2>
            <button
              onClick={fetchMeetings}
              className="text-xs text-blue-600 hover:underline"
            >
              Refresh
            </button>
          </div>

          {signedOut ? (
            <div className="p-12 text-center bg-white border border-slate-200 border-dashed rounded-xl">
              <h3 className="font-semibold text-slate-700 mb-1">
                Sign in to see meetings
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                The meetings API only answers signed-in users.
              </p>
              <Link
                href="/login"
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Sign in
              </Link>
            </div>
          ) : loading ? (
            <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-xl">
              Loading meetings...
            </div>
          ) : meetings.length === 0 ? (
            <div className="p-12 text-center bg-white border border-slate-200 border-dashed rounded-xl">
              <Calendar className="w-10 h-10 mx-auto text-slate-400 mb-3" />
              <h3 className="font-semibold text-slate-700 mb-1">
                No meetings yet
              </h3>
              <p className="text-sm text-slate-500">
                Use the form to schedule your first meeting.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-base text-slate-900">
                        {m.title}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatDate(m.starts_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatTime(m.starts_at)} – {formatTime(m.ends_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {m.attendee_count}{" "}
                          {m.attendee_count === 1 ? "attendee" : "attendees"}
                        </span>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-200">
                      Confirmed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
