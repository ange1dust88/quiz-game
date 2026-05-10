"use client";

// Last-resort boundary for errors thrown inside the root layout itself
// (where the regular error.tsx wouldn't be mounted). Must declare its own
// <html>/<body> since the layout failed.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          background: "#0a0a0f",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, marginBottom: 12 }}>
            App crashed unexpectedly
          </h1>
          <p style={{ fontSize: 14, color: "#9aa", marginBottom: 16 }}>
            Try refreshing the page. If the problem persists, the dev team
            has been notified.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#60a5fa",
              color: "white",
              border: "none",
              padding: "8px 20px",
              borderRadius: 8,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
