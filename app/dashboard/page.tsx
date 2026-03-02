"use client";

import { logout } from "../login/actions";
import { createRoom } from "./actions";
import { useFormStatus } from "react-dom";

function CreateRoomButton() {
  const { pending } = useFormStatus();

  return (
    <button disabled={pending} type="submit">
      Create Room
    </button>
  );
}

export default function Dashboard() {
  return (
    <div className="flex flex-col gap-4">
      <form action={createRoom}>
        <CreateRoomButton />
      </form>

      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}
