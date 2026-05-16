"use client";
import { useFormStatus } from "react-dom";
import Button from "./Button";

// Thin wrapper around our shared <Button> that ties into useFormStatus
// for the parent <form>. Login + Register both consume this so their
// submit affordance matches the rest of the app instead of drifting
// into custom Tailwind blocks.

export default function SubmitButton({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      fullWidth
      disabled={pending}
    >
      {pending ? "…" : text}
    </Button>
  );
}
