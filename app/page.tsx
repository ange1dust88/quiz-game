import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-slate-500 h-screen w-full">
      <Link href="/dashboard">dashboard</Link>
    </div>
  );
}
