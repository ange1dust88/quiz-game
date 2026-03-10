"use client";

import { useRouter } from "next/navigation";
import Input from "../components/ui/Input";
import { logout } from "../login/actions";
import { createRoom } from "./actions";
import { useFormStatus } from "react-dom";

function CreateRoomButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      className="bg-blue-400 hover:bg-blue-500 border border-blue-300 text-white px-6 py-3 rounded-lg"
      type="submit"
    >
      Create Room
    </button>
  );
}

export default function Dashboard() {
  const router = useRouter();

  function handleJoin(formData: FormData) {
    const roomId = formData.get("roomId");

    if (!roomId) return;

    router.push(`/lobby/${roomId}`);
  }

  return (
    <div
      className="h-screen  text-white p-10 flex flex-col gap-8 bg-cover bg-center"
      style={{ backgroundImage: "url('/gradient.png')" }}
    >
      <div className="flex justify-end items-center">
        <button
          onClick={() => logout()}
          className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] px-4 py-2 rounded-lg"
        >
          Logout
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <form
          action={createRoom}
          className="bg-[#1a1a1a] border border-[#4f4f4f] rounded-lg p-6 flex flex-col gap-4 justify-between"
        >
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Create Game</h2>
            <p className="text-[#757575]">
              Start a new match and invite friends
            </p>
          </div>

          <CreateRoomButton />
        </form>

        <form
          action={handleJoin}
          className="bg-[#1a1a1a] border border-[#4f4f4f] rounded-lg p-6 flex flex-col gap-4"
        >
          <h2 className="text-xl font-semibold">Join Game</h2>
          <p className="text-[#757575]">Enter a room ID to join a match</p>

          <Input placeholder="Room ID" type="text" id="roomId" name="roomId" />

          <button className="bg-blue-400 hover:bg-blue-500 border border-blue-300 text-white px-6 py-3 rounded-lg">
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
