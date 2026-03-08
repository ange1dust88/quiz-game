import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div
      className="flex justify-center items-center h-screen bg-slate-900 bg-cover bg-center"
      style={{ backgroundImage: "url('/gradient.png')" }}
    >
      <div className="w-full lg:w-[40%] flex items-center justify-center h-full">
        <LoginForm />
      </div>
    </div>
  );
}
