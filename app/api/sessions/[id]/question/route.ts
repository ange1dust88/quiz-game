import { prisma } from "@/app/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const question = await prisma.matchQuestion.findFirst({
    where: { gameSessionId: id, isActive: true },
    include: { question: true },
  });

  if (!question) return NextResponse.json(null);
  return NextResponse.json(question);
}
