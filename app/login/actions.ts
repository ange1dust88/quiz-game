"use server";

import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import { redirect } from "next/navigation";
import { createSession, deleteSession } from "../lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function login(prevState: any, formData: FormData) {
  const result = loginSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { errors: { email: ["Invalid email or password"] } };
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return { errors: { email: ["Invalid email or password"] } };
  }

  await createSession(user.id);

  redirect("/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
