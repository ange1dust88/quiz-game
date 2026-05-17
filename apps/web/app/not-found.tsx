// Catch-all 404 — fires both for unmatched routes and explicit notFound()
// calls deeper in the app. FACEIT-styled to match the rest of the shell.

import Link from "next/link";
import Slash from "./components/ui/Slash";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas text-white flex items-center justify-center px-6">
      <div
        className="max-w-md w-full bg-surface border p-8 flex flex-col items-center gap-3 text-center"
        style={{
          borderColor: "var(--color-stroke)",
          borderTop: "3px solid var(--color-accent)",
        }}
      >
        <Slash label="Not found" color="var(--color-accent)" dark />
        <div className="font-head text-6xl text-accent leading-none">404</div>
        <h1 className="font-head text-2xl text-white">PAGE NOT FOUND</h1>
        <p className="font-body text-sm text-mute leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist. The link may be
          stale, or you mistyped the URL.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Link
            href="/dashboard"
            className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2"
            style={{ transform: "skewX(-10deg)" }}
          >
            <span
              className="inline-block"
              style={{ transform: "skewX(10deg)" }}
            >
              Dashboard
            </span>
          </Link>
          <Link
            href="/"
            className="font-head text-xs text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-5 py-2"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
