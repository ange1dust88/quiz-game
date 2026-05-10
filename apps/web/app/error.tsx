"use client";

// Root error boundary — catches uncaught errors anywhere in the app
// (rendering errors, action exceptions, etc.) and renders a recoverable
// shell instead of a blank white page.
//
// In production we keep the UI minimal (don't leak stack traces); in
// development the message is shown to help debugging.

import { useEffect } from "react";
import Link from "next/link";

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
    <div className="min-h-screen text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-[#0d0d12]/90 border border-red-500/40 rounded-2xl p-8 flex flex-col gap-4 text-center">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          We hit an unexpected error. You can try again — if it keeps
          happening, head back to the dashboard.
        </p>
        {process.env.NODE_ENV !== "production" && (
          <pre className="text-[10px] text-left bg-[#1a1a1a] border border-[#333] rounded-md p-3 overflow-x-auto whitespace-pre-wrap text-red-200">
            {error.message}
            {error.digest && `\n\ndigest: ${error.digest}`}
          </pre>
        )}
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="bg-blue-400 hover:bg-blue-500 transition-colors text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-5 py-2 rounded-lg text-sm"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
