interface InputTypes {
  id: string;
  name: string;
  type: string;
  placeholder: string;
  required?: boolean;
}
function Input({ id, name, type, placeholder, required = false }: InputTypes) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      placeholder={placeholder}
      required={required}
      className="text-white bg-[#292929] border border-[#4f4f4f] focus:border-blue-500/60 focus:outline-none transition-colors rounded-lg px-4 py-2 placeholder:text-[#6a6a6a]"
    />
  );
}

export default Input;
