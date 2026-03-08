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
      className="bg-blue-400 border border-blue-300 text-white p-2 px-4 rounded-lg hover:bg-blue-500 hover:border-blue-400 cursor-pointer"
    >
      {text}
    </button>
  );
}

export default SubmitButton;
