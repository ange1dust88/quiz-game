"use server";

import { prisma } from "@/app/lib/prisma";

const Match = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id: sessionId } = await params;

  const countries = await prisma.matchCountry.findMany({
    where: { gameSessionId: sessionId },
    include: {
      template: true,
      owner: true,
    },
    orderBy: { templateId: "asc" },
  });

  if (!countries || countries.length === 0) {
    return <div>Match not found or map not initialized</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Match: {sessionId}</h1>
      <div className="grid grid-cols-4 gap-4">
        {countries.map((c) => (
          <div
            key={c.id}
            className="p-2 border rounded text-center bg-gray-400"
          >
            <div className="font-semibold">{c.template.name}</div>
            <div className="text-sm text-gray-700">
              {c.owner ? (
                <>
                  {c.owner.profileId} (
                  {c.owner.role === "host" ? "Host" : "Player"})
                </>
              ) : (
                "Unclaimed"
              )}
            </div>
            {c.isCapital && <div className="text-xs text-red-500">Capital</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Match;
