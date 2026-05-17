"use client";

// FACEIT-style sign-up card. Mirror of LoginForm with an extra Nickname
// field. Controlled inputs survive React 19's implicit form reset after
// the server action returns so the user doesn't have to retype on every
// validation error.

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { register } from "./actions";

export function RegisterForm() {
  const [state, registerAction] = useActionState(register, undefined);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");

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
      if (error) setShake(true);
    }
  }, [state, error]);

  return (
    <form
      action={registerAction}
      className={`w-full max-w-md bg-surface border border-stroke ${
        shake ? "animate-shake" : ""
      }`}
    >
      <header className="flex items-center justify-between px-5 py-4 border-b border-stroke">
        <div className="flex items-center gap-3">
          <HexLogo />
          <div className="flex flex-col leading-tight">
            <span className="font-head text-sm text-white">EUROPEQUIZ</span>
            <span className="font-mono text-[10px] text-dim uppercase">
              Create account
            </span>
          </div>
        </div>
        <Link
          href="/login"
          className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
        >
          Sign in
        </Link>
      </header>

      <motion.div
        layout
        transition={{ duration: 0.5 }}
        className="flex flex-col gap-4 p-5"
      >
        <Field label="Email">
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={INPUT_CLS}
          />
        </Field>

        <Field label="Nickname">
          <input
            id="nickname"
            name="nickname"
            type="text"
            placeholder="In-game name"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="username"
            className={INPUT_CLS}
          />
        </Field>

        <Field label="Password">
          <input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={INPUT_CLS}
          />
        </Field>

        <Submit text="Create account" />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ scale: 0.6, y: -10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="bg-lose/15 border border-lose font-mono text-xs text-lose px-3 py-2"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </form>
  );
}

const INPUT_CLS =
  "bg-canvas border border-stroke focus:border-accent focus:outline-none px-3 py-2.5 font-mono text-sm text-white placeholder:text-dim w-full";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-head text-[10px] text-dim">{label}</span>
      {children}
    </label>
  );
}

function Submit({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-head text-sm font-extrabold text-white bg-accent hover:bg-accent-dim disabled:opacity-60 disabled:cursor-wait transition-colors px-6 py-3 w-full"
      style={{ transform: "skewX(-10deg)" }}
    >
      <span className="inline-block" style={{ transform: "skewX(10deg)" }}>
        {pending ? "Creating…" : text}
      </span>
    </button>
  );
}

function HexLogo() {
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" aria-hidden="true">
      <polygon
        points="16,1 31,9 31,27 16,35 1,27 1,9"
        fill="#121822"
        stroke="#1ed3ff"
        strokeWidth="1.5"
      />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fill="#1ed3ff"
        fontSize="11"
        fontWeight="800"
        fontFamily="var(--font-geist-sans), system-ui"
      >
        EQ
      </text>
    </svg>
  );
}
