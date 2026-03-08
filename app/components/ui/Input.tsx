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
      className="border text-white bg-[#292929] border-[#4f4f4f] rounded-lg px-4 py-2"
    />
  );
}

export default Input;
