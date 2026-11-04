import type { ReactNode } from "react";

const PREVIEW_W = 375;
const PREVIEW_H = 780;
const SCALE = 0.8;

/**
 * A scaled phone frame for live previews of member screens. Children render at
 * a real 375×780 phone size; the frame is `relative`, so `contained` overlays
 * (viewer, celebrations) stay inside it.
 */
export default function PhonePreview({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[36px] border-[6px] border-[#1c1c1c] bg-surface shadow-2xl"
      style={{ width: PREVIEW_W * SCALE + 12, height: PREVIEW_H * SCALE + 12 }}
    >
      <div className="relative" style={{ width: PREVIEW_W, height: PREVIEW_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
