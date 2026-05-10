import { prisma } from "@quiz/db";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const attack = await prisma.warAttack.findFirst({
    where: { gameSessionId: id, isActive: true },
    include: {
      question: true,
      tieQuestion: true,
      country: { include: { template: true } },
      answers: true,
    },
  });

  if (!attack) return NextResponse.json(null);
  return NextResponse.json(attack);
}
