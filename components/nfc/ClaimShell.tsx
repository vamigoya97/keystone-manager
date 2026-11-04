import type { Keystone } from "@/lib/keystones";
import { BackgroundLayer } from "./themed";

type Themed = Pick<Keystone, "palette"> & { theme?: Keystone["theme"] };

/**
 * Full-screen, mobile-first frame for the claim → gallery flow.
 * Renders a soft glow in the keystone's palette behind the content.
 */
export default function ClaimShell({
  keystone,
  children,
  wide = false,
  contained = false,
  dim = 55,
  background,
}: {
  keystone: Themed;
  children: React.ReactNode;
  wide?: boolean;
  /** Fill the parent instead of the viewport (Customize preview). */
  contained?: boolean;
  /** How much the background media is darkened, 0–100. */
  dim?: number;
  /** Solid color behind the media (#RRGGBB); the standard surface otherwise. */
  background?: string;
}) {
  const [a, b] = keystone.palette;
  const bg = keystone.theme?.background;
  const height = contained ? "min-h-full h-full" : "min-h-[100dvh]";
  return (
    <div className={`relative overflow-hidden bg-surface ${height}`} style={background ? { backgroundColor: background } : undefined}>
      <BackgroundLayer media={bg?.media} dim={dim} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(60% 40% at 20% 0%, ${a}22, transparent 70%),
                       radial-gradient(50% 35% at 90% 10%, ${b}1f, transparent 70%)`,
        }}
      />
      <div
        className={`relative mx-auto flex ${height} flex-col px-5 pb-10 pt-6 ${
          wide ? "max-w-6xl" : "max-w-md"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export { NfcGlyph } from "./NfcGlyph";
