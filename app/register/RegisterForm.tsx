"use client";
import { motion, AnimatePresence } from "framer-motion";
import { useActionState, useEffect, useState } from "react";
import { register } from "./actions";
import Input from "../components/ui/Input";
import { useRouter } from "next/navigation";
import SubmitButton from "../components/ui/SubmitButton";

export function RegisterForm() {
  const [state, registerAction] = useActionState(register, undefined);

  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (state?.errors) {
      const message =
        state.errors.email?.[0] ||
        state.errors.nickname?.[0] ||
        state.errors.password?.[0];

      if (message) {
        setError(message);
        setTimeout(() => setShake(false), 400);
      }
      if (error) {
        setShake(true);
      }
    }
  }, [state]);

  return (
    <form
      action={registerAction}
      className="flex flex-col gap-4 bg-black rounded-lg p-2 w-110 transition-all duration-300"
    >
      <div className="flex justify-between px-4 pt-4">
        <div className="flex justify-center items-center gap-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 448 512"
            className="w-6 h-6 text-[#757575]"
            fill="currentColor"
          >
            <path d="M224 248a120 120 0 1 0 0-240 120 120 0 1 0 0 240zm-29.7 56C95.8 304 16 383.8 16 482.3 16 498.7 29.3 512 45.7 512l356.6 0c16.4 0 29.7-13.3 29.7-29.7 0-98.5-79.8-178.3-178.3-178.3l-59.4 0z" />
          </svg>
          <h1 className="text-white text-xl font-bold">Sign Up</h1>
        </div>
        <button
          onClick={() => router.push("/login")}
          className="text-white border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] rounded-lg px-4 py-2 cursor-pointer"
        >
          {" "}
          Sign In{" "}
        </button>
      </div>

      <motion.div
        layout
        transition={{ duration: 0.5 }}
        className={`flex flex-col gap-4 bg-[#1a1a1a] h-full p-4 rounded-lg  origin-top ${
          shake ? "animate-shake" : ""
        }`}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[#fafafa]">
            Email
          </label>
          <Input id="email" name="email" type="email" placeholder="Email" />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="nickname" className="text-[#fafafa]">
            Nickname
          </label>
          <Input
            id="nickname"
            name="nickname"
            type="text"
            placeholder="Nickname"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-[#fafafa]">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Password"
          />
        </div>
        <div>
          <SubmitButton text="Sign Up" />
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ scale: 0.6, y: -10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-[#e02424] rounded-lg text-white px-4 py-2"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </form>
  );
}
