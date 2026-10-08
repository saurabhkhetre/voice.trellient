import { cn } from "@/lib/utils";

type WaveformProps = {
  heights: ReadonlyArray<number>;
  barWidth?: number;
  className?: string;
};

/** Decorative animated voice bars. Purely visual, hidden from assistive tech. */
export function Waveform({ heights, barWidth = 3, className }: WaveformProps) {
  return (
    <div className={cn("lp-wave", className)} aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          style={{
            width: barWidth,
            height: h,
            animationDelay: `${((i * 7) % 11) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Small four-bar mark used in the logo lockup. */
export function BrandGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 10v4" />
      <path d="M9 6v12" />
      <path d="M14 3v18" />
      <path d="M19 8v8" />
    </svg>
  );
}
