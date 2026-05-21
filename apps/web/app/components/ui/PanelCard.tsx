// FACEIT-style bordered panel with a coloured title strip and optional
// right-side controls. Replaces the ad-hoc `<section className="bg-surface
// border …">` blocks we had on each dashboard card.
//
// Tone:
//   `accent`  — the colour of the 3px title bar (cyan / red / gold / blue).
//   `padded`  — pad the body. List-style panels set this to false so
//               their rows can hit the border edge-to-edge.

import { ReactNode } from "react";

type Props = {
  title: string;
  accent?: string;
  right?: ReactNode;
  padded?: boolean;
  // When true, the panel stretches to fill the height of its grid /
  // flex parent and its body becomes flex-1 — useful for chat panels
  // that should grow to the bottom of the viewport.
  fill?: boolean;
  children?: ReactNode;
};

export default function PanelCard({
  title,
  accent = "#1ed3ff",
  right,
  padded = true,
  fill = false,
  children,
}: Props) {
  return (
    <section
      className={`border border-stroke bg-surface${
        fill ? " h-full flex flex-col min-h-0" : ""
      }`}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-stroke">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-[3px] h-3.5"
            style={{ background: accent }}
            aria-hidden
          />
          <h2 className="font-head text-xs text-white">{title}</h2>
        </div>
        {right}
      </header>
      <div
        className={`${padded ? "p-4" : ""}${
          fill ? " flex-1 min-h-0" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}
