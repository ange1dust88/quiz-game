"use server";

import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nickname: z.string().min(3).max(20),
});

export async function register(prevState: any, formData: FormData) {
  const result = registerSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { email, password, nickname } = result.data;

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return {
      errors: {
        email: ["Email already in use"],
      },
    };
  }

  const existingNickname = await prisma.playerProfile.findUnique({
    where: { nickname },
  });

  if (existingNickname) {
    return {
      errors: {
        nickname: ["Nickname already taken"],
      },
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      profile: {
        create: {
          nickname,
        },
      },
    },
  });

  redirect("/login");
}
