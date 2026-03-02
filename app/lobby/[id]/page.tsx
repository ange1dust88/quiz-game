"use server";
import { prisma } from "@/app/lib/prisma";

const LobbyPage = async ({ params }: { params: { id: string } }) => {
  const { id } = await params;

  const session = await prisma.gameSession.findUnique({
    where: { id },
    include: {
      players: {
        include: {
          profile: true,
        },
      },
    },
  });

  if (!session) {
    return <div>Комната не найдена</div>;
  }

  const players = session.players || [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Лобби игры</h1>
      <p>
        <strong>Match ID:</strong> {session.id}
      </p>
      <p>
        <strong>Status:</strong> {session.status}
      </p>

      <div>
        <h2 className="text-xl font-semibold">Игроки:</h2>
        {players.length > 0 ? (
          <ul className="list-disc pl-5">
            {players.map((p) => (
              <li key={p.id}>{p.profile?.nickname || "Без ника"}</li>
            ))}
          </ul>
        ) : (
          <p>Игроки пока не присоединились</p>
        )}
      </div>

      {session.status === "active" && <p>Игра запущена!</p>}
    </div>
  );
};

export default LobbyPage;
