import type { ChangeEvent } from "react";

interface InputTypes {
  id: string;
  name: string;
  type: string;
  placeholder: string;
  required?: boolean;
  // Optional controlled-mode props — when present the input is bound to
  // React state. Useful because React 19 implicitly calls form.reset()
  // after a server action returns, which wipes uncontrolled fields. A
  // controlled value isn't reset by form.reset().
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  spellCheck?: boolean;
}
function Input({
  id,
  name,
  type,
  placeholder,
  required = false,
  value,
  onChange,
  autoComplete,
  spellCheck,
}: InputTypes) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      placeholder={placeholder}
      required={required}
      value={value}
      onChange={onChange}
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      className="text-white bg-[#292929] border border-[#4f4f4f] focus:border-blue-500/60 focus:outline-none transition-colors rounded-lg px-4 py-2 placeholder:text-[#6a6a6a]"
    />
  );
}

export default Input;
