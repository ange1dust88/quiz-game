import { useFormStatus } from "react-dom";

interface SubmitButtonTypes {
  text: string;
}

function SubmitButton({ text }: SubmitButtonTypes) {
  const { pending } = useFormStatus();

  return (
    <button
      disabled={pending}
      type="submit"
      className="bg-blue-400 hover:bg-blue-500 transition-colors text-white px-6 py-3 rounded-lg font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {text}
    </button>
  );
}

export default SubmitButton;
