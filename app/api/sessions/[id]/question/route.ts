import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const question = await prisma.matchQuestion.findFirst({
    where: { gameSessionId: params.id, isActive: true },
    include: { question: true },
  });

  if (!question) return NextResponse.json(null);
  return NextResponse.json(question);
}
