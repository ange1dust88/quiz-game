// FACEIT-style "coming soon" card used for stubbed routes.
// One sharp bordered panel with a coloured top stripe, a "Coming soon"
// slash, heading + description, and a back-to-dashboard CTA.

import Link from "next/link";
import Slash from "./Slash";

type Props = {
  title: string;
  description: string;
  accent?: string;
};

export default function PlaceholderPanel({
  title,
  description,
  accent = "#ffc24a",
}: Props) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-6 bg-canvas text-white">
      <div
        className="max-w-md w-full text-center flex flex-col items-center gap-4 bg-surface border p-8"
        style={{
          borderColor: "var(--color-stroke)",
          borderTop: `3px solid ${accent}`,
        }}
      >
        <Slash label="Coming soon" color={accent} dark />
        <h1 className="font-head text-3xl text-white">{title.toUpperCase()}</h1>
        <p className="font-body text-sm text-mute leading-relaxed">
          {description}
        </p>
        <Link
          href="/dashboard"
          className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2 mt-1"
          style={{ transform: "skewX(-10deg)" }}
        >
          <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
            Back to dashboard
          </span>
        </Link>
      </div>
    </div>
  );
}
