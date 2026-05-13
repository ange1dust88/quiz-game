// Catch-all 404 — fires both for unmatched routes and explicit notFound()
// calls deeper in the app. Styled to match the dark-theme error.tsx shell.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-[#0d0d12]/90 border border-[#4f4f4f] rounded-2xl p-8 flex flex-col gap-4 text-center">
        <div className="text-5xl font-extrabold text-gray-400">404</div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist. The link may
          be stale, or you mistyped the URL.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link
            href="/dashboard"
            className="bg-blue-400 hover:bg-blue-500 transition-colors text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            Dashboard
          </Link>
          <Link
            href="/"
            className="border border-[#4f4f4f] bg-[#1a1a1a] hover:bg-[#292929] transition-colors px-5 py-2 rounded-lg text-sm"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
