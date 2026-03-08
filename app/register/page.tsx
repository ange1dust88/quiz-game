import { RegisterForm } from "./RegisterForm";

export default function Register() {
  return (
    <div
      className="flex justify-center items-center h-screen bg-slate-900 bg-cover bg-center"
      style={{ backgroundImage: "url('/gradient.png')" }}
    >
      <div className="w-full lg:w-[40%] flex items-center justify-center h-full">
        <RegisterForm />
      </div>
    </div>
  );
}
