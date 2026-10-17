// Spry's mascot: a small, busy sparrow with a clipboard, waving hello.
// Drawn as a sticker: cream fill, thick ink outline, a cream halo around it.

const INK = "#2f3a8f";
const CREAM = "#fbf1de";
const LIME = "#d9f15c";
const CORAL = "#f27b5b";

export function SpryMascot({
  className,
  title = "Spry the sparrow",
}: {
  className?: string;
  title?: string;
}) {
  const body =
    "M60 26c20 0 34 15 34 35 0 22-15 37-34 37S26 83 26 61c0-20 14-35 34-35z";
  const wing = "M88 52c8-10 16-14 21-11 4 3-1 12-10 18-5 3-9 4-12 3";
  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* halo, so the sticker reads on any background */}
      <g stroke={CREAM} strokeWidth={14} strokeLinejoin="round" fill={CREAM}>
        <path d={body} />
        <path d={wing} />
        <rect x={30} y={62} width={26} height={32} rx={4} />
      </g>

      {/* legs */}
      <g stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none">
        <path d="M52 96v10M50 106h6" />
        <path d="M68 96v10M66 106h6" />
      </g>

      {/* tuft */}
      <g stroke={INK} strokeWidth={4} strokeLinecap="round" fill="none">
        <path d="M56 26c-2-6 0-11 4-13" />
        <path d="M63 26c1-5 5-8 9-8" />
      </g>

      {/* body and waving wing */}
      <path d={body} fill={CREAM} stroke={INK} strokeWidth={5} />
      <path
        d={wing}
        fill={CREAM}
        stroke={INK}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* face */}
      <circle cx={50} cy={52} r={4} fill={INK} />
      <circle cx={70} cy={52} r={4} fill={INK} />
      <circle cx={43} cy={62} r={4.5} fill={CORAL} opacity={0.7} />
      <circle cx={77} cy={62} r={4.5} fill={CORAL} opacity={0.7} />
      <path
        d="M54 60l6 8 6-8z"
        fill={LIME}
        stroke={INK}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />

      {/* clipboard */}
      <rect
        x={30}
        y={62}
        width={26}
        height={32}
        rx={4}
        fill="#ffffff"
        stroke={INK}
        strokeWidth={4}
      />
      <rect
        x={37}
        y={58}
        width={12}
        height={7}
        rx={2}
        fill={LIME}
        stroke={INK}
        strokeWidth={3}
      />
      <g stroke={INK} strokeWidth={3} strokeLinecap="round">
        <path d="M36 74h14M36 81h14M36 88h9" />
      </g>
    </svg>
  );
}
