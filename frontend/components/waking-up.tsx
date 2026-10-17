"use client";

import { useEffect, useState } from "react";

import { SpryMascot } from "@/components/spry-mascot";

// Shown while the meetings load. The first request after a quiet spell can
// take ~15 s: Aurora Serverless pauses after 5 idle minutes and resumes on
// the next connection. After a few seconds, say so instead of just spinning.
export function WakingUp() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      500,
    );
    return () => clearInterval(timer);
  }, []);

  const slow = seconds >= 3;

  return (
    <div className="space-y-5" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-4 p-5 bg-paper border-2 border-ink rounded-3xl shadow-sticker">
        <SpryMascot className="w-16 h-16 shrink-0 animate-bounce [animation-duration:1.4s]" />
        <div>
          <p className="font-display font-extrabold text-lg leading-tight">
            {slow ? "Waking up the database…" : "Loading meetings…"}
          </p>
          <p className="text-sm text-ink/70 mt-1">
            {slow
              ? `The database naps after 5 quiet minutes to save money, and the first visit wakes it up. Usually about 15 s · ${seconds}s so far`
              : "Fetching your board."}
          </p>
          {slow && (
            <div className="mt-3 h-2 w-full max-w-xs rounded-full bg-ink-soft border-2 border-ink overflow-hidden">
              <div
                className="h-full bg-lime transition-[width] duration-500"
                style={{ width: `${Math.min(100, (seconds / 15) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {[0, 1].map((i) => (
        <div
          key={i}
          className="p-5 bg-paper border-2 border-ink/20 rounded-3xl animate-pulse"
        >
          <div className="flex items-start gap-4">
            <div className="w-16 h-20 rounded-2xl bg-ink-soft" />
            <div className="flex-1 space-y-3 pt-1">
              <div className="h-5 w-1/2 rounded-full bg-ink-soft" />
              <div className="flex gap-2">
                <div className="h-6 w-32 rounded-full bg-ink-soft" />
                <div className="h-6 w-24 rounded-full bg-ink-soft" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
