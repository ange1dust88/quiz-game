"use client";

// Last-resort boundary for errors thrown inside the root layout itself
// (where the regular error.tsx wouldn't be mounted). Must declare its own
// <html>/<body> since the layout failed — no access to global tokens or
// fonts here, so styles are inline + match the canvas/stroke palette.

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
          background: "#0d1218",
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
        <div
          style={{
            maxWidth: 420,
            background: "#171f2a",
            border: "1px solid #262f3d",
            borderTop: "3px solid #ff4244",
            padding: "32px 28px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#ff4244",
              fontWeight: 800,
              marginBottom: 14,
            }}
          >
            Critical error
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              margin: 0,
              marginBottom: 10,
            }}
          >
            App crashed unexpectedly
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "#8a93a1",
              margin: 0,
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            Try refreshing the page. If the problem persists, the dev team
            has been notified.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#1ed3ff",
              color: "#06141c",
              border: "none",
              padding: "9px 20px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              transform: "skewX(-10deg)",
            }}
          >
            <span style={{ display: "inline-block", transform: "skewX(10deg)" }}>
              Try again
            </span>
          </button>
        </div>
      </body>
    </html>
  );
}
