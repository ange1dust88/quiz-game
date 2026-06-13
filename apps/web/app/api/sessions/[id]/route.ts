import { NextResponse } from "next/server";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Require a signed-in caller. The lobby page renders for non-members
    // too (the "join this lobby" prompt), so we don't enforce membership
    // here — but an anonymous request shouldn't be able to enumerate any
    // session by id.
    const me = await getProfileSafe();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const session = await prisma.gameSession.findUnique({
      where: { id: id },
      include: {
        players: {
          include: {
            profile: {
              select: {
                nickname: true,
                avatarUrl: true,
                level: true,
                elo: true,
                country: true,
              },
            },
            choices: { select: { key: true, value: true } },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    // Log server-side, but don't echo the raw error (which can contain
    // query / connection details) back to the client.
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
