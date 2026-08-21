"use client";

// Submit button for the settings form — client component so
// useFormStatus can show progress while the server action saves +
// redirects to the profile.

import { useFormStatus } from "react-dom";

export default function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-head text-sm font-extrabold text-white bg-accent hover:bg-accent-dim disabled:opacity-70 transition-colors px-6 py-2"
      style={{ transform: "skewX(-10deg)" }}
    >
      <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
        {pending ? "Saving…" : "Save"}
      </span>
    </button>
  );
}
