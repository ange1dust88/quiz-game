"use client";

export default function CopyMatchId({ id }: { id: string }) {
  function copy() {
    navigator.clipboard.writeText(id);
  }

  return (
    <div
      onClick={copy}
      className="cursor-pointer px-6 py-2 rounded-lg border border-blue-300 bg-blue-400 hover:bg-blue-300 "
    >
      Copy Room ID
    </div>
  );
}
