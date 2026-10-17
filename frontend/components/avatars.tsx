"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

// Eight little characters to pick from, drawn for Peach: flat shapes, dot
// eyes, chunky feet. The choice is remembered in this browser, per account.

const INK = "#232c70";

function Eyes({
  y = 30,
  gap = 8,
  x = 32,
}: {
  y?: number;
  gap?: number;
  x?: number;
}) {
  return (
    <g fill={INK}>
      <circle cx={x - gap / 2} cy={y} r={2.6} />
      <circle cx={x + gap / 2} cy={y} r={2.6} />
    </g>
  );
}

function Feet({ y = 52, color = INK }: { y?: number; color?: string }) {
  return (
    <g fill={color}>
      <ellipse cx={24} cy={y} rx={6} ry={4} />
      <ellipse cx={40} cy={y} rx={6} ry={4} />
    </g>
  );
}

export interface AvatarDef {
  id: string;
  name: string;
  bg: string;
  art: ReactNode;
}

export const AVATARS: AvatarDef[] = [
  {
    id: "pip",
    name: "Pip the chick",
    bg: "#d9f15c",
    art: (
      <>
        <Feet />
        <circle cx={32} cy={34} r={16} fill="#ffd25e" />
        <path
          d="M30 18c0-5 4-7 6-6"
          stroke={INK}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
        <Eyes y={31} />
        <path d="M28 36l4 5 4-5z" fill="#f27b5b" />
      </>
    ),
  },
  {
    id: "blu",
    name: "Blu the ghost",
    bg: "#fbf1de",
    art: (
      <>
        <path
          d="M16 54V32a16 16 0 0 1 32 0v22l-5-4-5 4-6-4-6 4-5-4z"
          fill="#6f86e8"
        />
        <ellipse cx={32} cy={34} rx={10} ry={8} fill="#ffffff" />
        <Eyes y={33} />
        <path
          d="M29 38q3 3 6 0"
          stroke="#f27b5b"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: "mush",
    name: "Mush the mushroom",
    bg: "#c8e6d6",
    art: (
      <>
        <Feet y={54} color="#8a5a44" />
        <rect x={24} y={30} width={16} height={22} rx={7} fill="#fbf1de" />
        <path d="M12 32a20 16 0 0 1 40 0z" fill="#f2665b" />
        <g fill="#ffffff">
          <circle cx={22} cy={24} r={3} />
          <circle cx={34} cy={20} r={2.5} />
          <circle cx={43} cy={27} r={2.5} />
        </g>
        <Eyes y={39} gap={7} />
      </>
    ),
  },
  {
    id: "leaf",
    name: "Leaf the sprout",
    bg: "#ffe6c7",
    art: (
      <>
        <Feet />
        <rect x={18} y={24} width={28} height={26} rx={12} fill="#5fbf7f" />
        <path d="M32 24c-2-8 2-12 8-13-1 6-4 10-8 13z" fill="#2e9d5f" />
        <path d="M32 24c-3-6-8-8-12-7 2 4 6 7 12 7z" fill="#7fd39b" />
        <Eyes y={35} />
        <path
          d="M28 41h8"
          stroke={INK}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: "toast",
    name: "Toast",
    bg: "#bcd3ff",
    art: (
      <>
        <Feet />
        <path
          d="M18 26a8 8 0 0 1 2-14h24a8 8 0 0 1 2 14v22a3 3 0 0 1-3 3H21a3 3 0 0 1-3-3z"
          fill="#d79a56"
        />
        <path
          d="M22 26a5 5 0 0 1 1-10h18a5 5 0 0 1 1 10v20H22z"
          fill="#f6dba6"
        />
        <Eyes y={30} />
        <circle cx={25} cy={36} r={2.5} fill="#f27b5b" opacity={0.6} />
        <circle cx={39} cy={36} r={2.5} fill="#f27b5b" opacity={0.6} />
        <path
          d="M29 36q3 3 6 0"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: "puff",
    name: "Puff the cloud",
    bg: "#2f3a8f",
    art: (
      <>
        <path
          d="M18 44a9 9 0 0 1 1-18 12 12 0 0 1 23-3 10 10 0 0 1 5 20z"
          fill="#ffffff"
        />
        <Eyes y={34} />
        <circle cx={23} cy={38} r={2.6} fill="#f7a3b8" />
        <circle cx={41} cy={38} r={2.6} fill="#f7a3b8" />
        <path
          d="M29 39q3 2.5 6 0"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <g stroke="#d9f15c" strokeWidth={2.5} strokeLinecap="round">
          <path d="M24 50l-2 5" />
          <path d="M32 50v5" />
          <path d="M40 50l2 5" />
        </g>
      </>
    ),
  },
  {
    id: "star",
    name: "Sunny the star",
    bg: "#fde6df",
    art: (
      <>
        <path
          d="M32 10l6 13 14 2-10 10 3 14-13-7-13 7 3-14-10-10 14-2z"
          fill="#ffb347"
          strokeLinejoin="round"
          stroke="#ffb347"
          strokeWidth={4}
        />
        <Eyes y={30} gap={7} />
        <path
          d="M29 35q3 3 6 0"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: "bean",
    name: "Bean",
    bg: "#f3fbcf",
    art: (
      <>
        <Feet y={54} />
        <path
          d="M22 18c8-8 24-2 22 14-2 13 2 20-8 21-12 1-19-6-18-16 1-7-2-13 4-19z"
          fill="#a98ce8"
        />
        <Eyes y={30} x={33} />
        <path
          d="M30 36q3 3 6 0"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
        <circle cx={44} cy={16} r={3} fill="#f27b5b" />
        <path
          d="M42 18q-4 2-7 1"
          stroke={INK}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
        />
      </>
    ),
  },
];

export function Avatar({
  avatar,
  className = "w-9 h-9",
}: {
  avatar: AvatarDef;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={avatar.name}
      className={`${className} rounded-full border-2 border-cream`}
      style={{ background: avatar.bg }}
    >
      {avatar.art}
    </svg>
  );
}

const storageKey = (userId: string) => `avatar:${userId}`;

/** Same default for the same account, until someone picks one. */
function defaultFor(userId: string): AvatarDef {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[hash % AVATARS.length];
}

function load(userId: string): AvatarDef {
  try {
    const id = localStorage.getItem(storageKey(userId));
    return AVATARS.find((a) => a.id === id) ?? defaultFor(userId);
  } catch {
    return defaultFor(userId);
  }
}

export function AvatarPicker({ userId }: { userId: string }) {
  const [avatar, setAvatar] = useState<AvatarDef>(() => defaultFor(userId));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Read the saved choice once we are in the browser (the static export
  // prerenders without localStorage).
  useEffect(() => {
    const saved = load(userId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatar(saved);
  }, [userId]);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (a: AvatarDef) => {
    setAvatar(a);
    setOpen(false);
    try {
      localStorage.setItem(storageKey(userId), a.id);
    } catch {
      // Private mode: it lasts until the tab closes.
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="block rounded-full transition-transform hover:scale-110 hover:-rotate-6"
        aria-label="Choose your avatar"
        aria-expanded={open}
        title="Choose your avatar"
      >
        <Avatar avatar={avatar} className="w-10 h-10" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-72 p-4 bg-paper text-ink border-2 border-ink rounded-3xl shadow-sticker">
          <p className="font-display font-extrabold text-lg mb-3">
            Pick your buddy
          </p>
          <div className="grid grid-cols-4 gap-3">
            {AVATARS.map((a) => (
              <button
                key={a.id}
                onClick={() => choose(a)}
                className={`relative rounded-full transition-transform hover:scale-110 ${
                  a.id === avatar.id ? "ring-4 ring-lime" : ""
                }`}
                aria-label={a.name}
                title={a.name}
              >
                <Avatar avatar={a} className="w-14 h-14 !border-ink" />
                {a.id === avatar.id && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-lime border-2 border-ink flex items-center justify-center">
                    <Check className="w-3 h-3" strokeWidth={3.5} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink/60 mt-3">Saved in this browser.</p>
        </div>
      )}
    </div>
  );
}
