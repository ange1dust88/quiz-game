"use client";

// Root error boundary — catches uncaught errors anywhere in the app
// (rendering errors, action exceptions, etc.) and renders a recoverable
// shell instead of a blank white page.
//
// In production we keep the UI minimal (don't leak stack traces); in
// development the message is shown to help debugging.

import { useEffect } from "react";
import Link from "next/link";
import Slash from "./components/ui/Slash";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-canvas text-white flex items-center justify-center px-6">
      <div
        className="max-w-md w-full bg-surface border p-8 flex flex-col items-center gap-4 text-center"
        style={{
          borderColor: "var(--color-stroke)",
          borderTop: "3px solid var(--color-lose)",
        }}
      >
        <Slash label="Error" color="var(--color-lose)" dark />
        <h1 className="font-head text-2xl text-white">SOMETHING WENT WRONG</h1>
        <p className="font-body text-sm text-mute leading-relaxed">
          We hit an unexpected error. You can try again — if it keeps
          happening, head back to the dashboard.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <pre className="font-mono text-[10px] text-left bg-canvas border border-stroke p-3 overflow-x-auto whitespace-pre-wrap text-lose w-full">
            {error.message}
            {error.digest && `\n\ndigest: ${error.digest}`}
          </pre>
        )}
        <div className="flex gap-2 justify-center pt-1">
          <button
            onClick={reset}
            className="font-head text-xs font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-5 py-2"
            style={{ transform: "skewX(-10deg)" }}
          >
            <span
              className="inline-block"
              style={{ transform: "skewX(10deg)" }}
            >
              Try again
            </span>
          </button>
          <Link
            href="/dashboard"
            className="font-head text-xs text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-5 py-2"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
