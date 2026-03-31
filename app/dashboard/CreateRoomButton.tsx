"use client";
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
export default CreateRoomButton;
