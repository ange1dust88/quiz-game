"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { register } from "./actions";

export function RegisterForm() {
  const [state, registerAction] = useActionState(register, undefined);

  return (
    <form action={registerAction} className="flex max-w-75 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <input id="email" name="email" placeholder="Email" type="email" />
        {state?.errors?.email && (
          <p className="text-red-500 text-sm">
            {state.errors.email.join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input id="nickname" name="nickname" placeholder="Nickname" />
        {state?.errors?.nickname && (
          <p className="text-red-500 text-sm">
            {state.errors.nickname.join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Password"
        />
        {state?.errors?.password && (
          <p className="text-red-500 text-sm">
            {state.errors.password.join(", ")}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      type="submit"
      className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
    >
      Зарегистрироваться
    </button>
  );
}
