// Decorative stickers, drawn for Peach: flat shapes, thick ink outline and a
// cream die-cut halo, like the mascot. Purely visual: aria-hidden, and they
// never take clicks away from the controls underneath.

const INK = "#232c70";
const CREAM = "#fbf1de";
const LIME = "#d9f15c";
const CORAL = "#f27b5b";
const SKY = "#8fb3ff";
const SUN = "#ffd25e";

type Kind =
  | "star"
  | "heart"
  | "coffee"
  | "bubble"
  | "sparkle"
  | "check"
  | "clock"
  | "rainbow";

function Art({ kind }: { kind: Kind }) {
  // Each sticker is drawn twice: once fat in cream (the die-cut halo), then
  // filled and outlined in ink on top.
  const outline = {
    stroke: INK,
    strokeWidth: 3.5,
    strokeLinejoin: "round" as const,
  };
  const halo = {
    stroke: CREAM,
    strokeWidth: 12,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "star": {
      const d = "M32 6l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 23l16-2z";
      return (
        <>
          <path d={d} fill={CREAM} {...halo} />
          <path d={d} fill={LIME} {...outline} />
          <g fill={INK}>
            <circle cx={27} cy={28} r={2.2} />
            <circle cx={37} cy={28} r={2.2} />
          </g>
          <path
            d="M29 33q3 3 6 0"
            stroke={INK}
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    }
    case "heart": {
      const d =
        "M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z";
      return (
        <>
          <path d={d} fill={CREAM} {...halo} />
          <path d={d} fill={CORAL} {...outline} />
          <path
            d="M18 22a6 6 0 0 1 6-5"
            stroke={CREAM}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    }
    case "coffee": {
      return (
        <>
          <g fill={CREAM} {...halo}>
            <path d="M12 24h34v16a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" />
            <path d="M46 28h4a7 7 0 0 1 0 14h-4" />
          </g>
          <path d="M46 28h4a7 7 0 0 1 0 14h-4" fill="none" {...outline} />
          <path
            d="M12 24h34v16a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z"
            fill={SKY}
            {...outline}
          />
          <g stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none">
            <path d="M22 16q-3-4 0-8" />
            <path d="M30 16q-3-4 0-8" />
            <path d="M38 16q-3-4 0-8" />
          </g>
          <g fill={INK}>
            <circle cx={24} cy={36} r={2.2} />
            <circle cx={34} cy={36} r={2.2} />
          </g>
          <path
            d="M26 42q3 3 6 0"
            stroke={INK}
            strokeWidth={2.2}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    }
    case "bubble": {
      const d =
        "M10 12h44a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H28l-12 10 2-10h-8a6 6 0 0 1-6-6V18a6 6 0 0 1 6-6z";
      return (
        <>
          <path d={d} fill={CREAM} {...halo} />
          <path d={d} fill="#ffffff" {...outline} />
          <text
            x={32}
            y={33}
            textAnchor="middle"
            textLength={42}
            lengthAdjust="spacingAndGlyphs"
            fontSize={10}
            fontWeight={800}
            fill={INK}
            fontFamily="var(--font-display-family), system-ui, sans-serif"
          >
            let&apos;s meet!
          </text>
        </>
      );
    }
    case "sparkle": {
      const d =
        "M32 6c2 14 6 18 20 20-14 2-18 6-20 20-2-14-6-18-20-20 14-2 18-6 20-20z";
      return (
        <>
          <path d={d} fill={CREAM} {...halo} />
          <path d={d} fill={SUN} {...outline} />
          <circle
            cx={50}
            cy={48}
            r={5}
            fill={LIME}
            stroke={INK}
            strokeWidth={3}
          />
        </>
      );
    }
    case "check": {
      return (
        <>
          <circle cx={32} cy={32} r={24} fill={CREAM} {...halo} />
          <circle cx={32} cy={32} r={24} fill={LIME} {...outline} />
          <path
            d="M21 33l7 7 15-16"
            stroke={INK}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    }
    case "clock": {
      return (
        <>
          <circle cx={32} cy={34} r={22} fill={CREAM} {...halo} />
          <g fill={CORAL} {...outline}>
            <circle cx={16} cy={14} r={6} />
            <circle cx={48} cy={14} r={6} />
          </g>
          <circle cx={32} cy={34} r={22} fill="#ffffff" {...outline} />
          <path
            d="M32 21v13l9 6"
            stroke={INK}
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={32} cy={34} r={2.5} fill={INK} />
        </>
      );
    }
    case "rainbow": {
      return (
        <>
          <path
            d="M6 46a26 26 0 0 1 52 0"
            fill="none"
            stroke={CREAM}
            strokeWidth={30}
          />
          <path
            d="M8 46a24 24 0 0 1 48 0"
            fill="none"
            stroke={CORAL}
            strokeWidth={8}
          />
          <path
            d="M16 46a16 16 0 0 1 32 0"
            fill="none"
            stroke={SUN}
            strokeWidth={8}
          />
          <path
            d="M24 46a8 8 0 0 1 16 0"
            fill="none"
            stroke={SKY}
            strokeWidth={8}
          />
          <path
            d="M4 46a28 28 0 0 1 56 0M20 46a12 12 0 0 1 24 0"
            fill="none"
            stroke={INK}
            strokeWidth={3}
          />
          <g fill="#ffffff" stroke={INK} strokeWidth={3}>
            <ellipse cx={10} cy={48} rx={9} ry={6} />
            <ellipse cx={54} cy={48} rx={9} ry={6} />
          </g>
        </>
      );
    }
  }
}

export function Sticker({
  kind,
  className = "w-12 h-12",
  rotate = 0,
}: {
  kind: Kind;
  className?: string;
  rotate?: number;
}) {
  return (
    <svg
      viewBox="-4 -4 72 72"
      aria-hidden="true"
      className={`sticker pointer-events-none select-none drop-shadow-[2px_2px_0_rgba(35,44,112,0.35)] ${className}`}
      style={{ "--r": `${rotate}deg` } as React.CSSProperties}
    >
      <Art kind={kind} />
    </svg>
  );
}
