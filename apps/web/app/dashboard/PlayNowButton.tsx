"use client";

// Submit button for the dashboard's create-lobby form. Split out as a
// client component so useFormStatus can show a pending state while the
// server action creates the session + redirects — without it the hero
// button felt dead for the ~0.5-1s round trip.

import { useFormStatus } from "react-dom";

export default function PlayNowButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-head text-lg font-extrabold text-white bg-accent hover:bg-accent-dim disabled:opacity-70 transition-colors px-9 py-4"
      style={{ transform: "skewX(-10deg)" }}
    >
      <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
        {pending ? "Creating lobby…" : "► Play now"}
      </span>
    </button>
  );
}
