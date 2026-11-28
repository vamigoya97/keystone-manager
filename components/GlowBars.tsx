/**
 * The loading mark used across member screens and the console: three soft,
 * blurred bars, tallest first, breathing one after another in the current text
 * color. Sizes: "sm" sits inside a button or a line of text, "md" fills a
 * panel, "lg" fills a screen. With reduced motion the bars hold still.
 *
 * Pass `label` to show a caption under the bars (and announce it); without one,
 * screen readers hear "Loading". `decorative` drops the announcement, for when
 * the surrounding control already says what is happening (a busy button).
 */
export default function GlowBars({
  size = "md",
  label,
  decorative = false,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const bars = (
    <span aria-hidden className={`glow-bars glow-bars--${size}`}>
      <i />
      <i />
      <i />
    </span>
  );
  if (decorative) return <span className={`inline-flex ${className}`}>{bars}</span>;
  return (
    <span role="status" aria-live="polite" className={`inline-flex flex-col items-center ${size === "lg" ? "gap-6" : "gap-3"} ${className}`}>
      {bars}
      {label ? <span className={size === "lg" ? "text-[15px] opacity-80" : "text-[13px] opacity-75"}>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}
