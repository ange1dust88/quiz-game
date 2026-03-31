import { cookies } from "next/headers";
import { decrypt } from "@/app/lib/session";
import { prisma } from "@/app/lib/prisma";

export async function getProfile() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) throw new Error("No session token");

  const payload = await decrypt(token);
  const userId = payload?.userId as string;
  if (!userId) throw new Error("Invalid session");

  const profile = await prisma.playerProfile.findUnique({ where: { userId } });
  if (!profile) throw new Error("Profile not found");

  return profile;
}

export async function getProfileSafe() {
  try {
    return await getProfile();
  } catch {
    return null;
  }
}
