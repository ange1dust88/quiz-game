"use client";
import { useFormStatus } from "react-dom";
import Button from "../components/ui/Button";

export default function CreateRoomButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Creating…" : "Create room"}
    </Button>
  );
}
