// Admin moderation queue for avatar submissions. Same admin gating as
// /analytics — comma-separated email list in ADMIN_EMAILS. Non-admins
// get redirected to dashboard. Pending submissions are shown newest
// last so the queue feels like FIFO when an admin works through it.
//
// Approve and Reject are both POST forms hitting server actions which
// move the file in Supabase Storage and update the AvatarSubmission row.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import { approveAvatar, rejectAvatar } from "@/app/lib/avatarActions";

function parseAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminAvatarsPage() {
  const profile = await getProfileSafe();
  if (!profile) redirect("/login");
  const adminEmails = parseAdminEmails();
  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { email: true },
  });
  if (!user || !adminEmails.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  const pending = await prisma.avatarSubmission.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: {
      profile: { select: { nickname: true, avatarUrl: true } },
    },
  });

  const recent = await prisma.avatarSubmission.findMany({
    where: { status: { in: ["approved", "rejected"] } },
    orderBy: { reviewedAt: "desc" },
    take: 20,
    include: {
      profile: { select: { nickname: true } },
      reviewer: { select: { nickname: true } },
    },
  });

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10 flex flex-col gap-8">
        <header className="flex items-center justify-between flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-white transition-colors px-4 py-2 border border-[#4f4f4f] rounded-lg"
          >
            ← Dashboard
          </Link>
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-gray-400">
              Moderation
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold">Avatar reviews</h1>
          </div>
        </header>

        <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-sm uppercase tracking-widest text-gray-400">
              Pending queue
            </h2>
            <span className="text-xs text-gray-500">
              {pending.length} waiting
            </span>
          </div>

          {pending.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing to review — queue is empty.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 bg-[#14141a] border border-[#2a2a32] rounded-xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#0d0d12] shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.publicUrl}
                        alt={p.profile.nickname}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <Link
                        href={`/profile/${encodeURIComponent(p.profile.nickname)}`}
                        className="text-sm font-semibold hover:underline truncate"
                      >
                        {p.profile.nickname}
                      </Link>
                      <span className="text-[11px] text-gray-500">
                        submitted{" "}
                        {new Date(p.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {p.profile.avatarUrl && (
                        <span className="text-[10px] text-amber-300 uppercase tracking-widest mt-1">
                          replaces current
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <form action={approveAvatar} className="flex-1">
                      <input
                        type="hidden"
                        name="submissionId"
                        value={p.id}
                      />
                      <button
                        type="submit"
                        className="w-full text-sm bg-emerald-500 hover:bg-emerald-600 text-black font-semibold px-3 py-1.5 rounded-md"
                      >
                        Approve
                      </button>
                    </form>
                    <form
                      action={rejectAvatar}
                      className="flex-1 flex gap-1"
                    >
                      <input
                        type="hidden"
                        name="submissionId"
                        value={p.id}
                      />
                      <input
                        type="text"
                        name="reason"
                        placeholder="reason (optional)"
                        maxLength={200}
                        className="flex-1 min-w-0 text-xs bg-[#0d0d12] border border-[#3a3a3a] focus:border-red-400/60 focus:outline-none rounded-md px-2 py-1.5"
                      />
                      <button
                        type="submit"
                        className="text-sm bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 font-semibold px-3 py-1.5 rounded-md shrink-0"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-3">
          <h2 className="text-sm uppercase tracking-widest text-gray-400">
            Recent decisions
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500">No decisions yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#14141a] border border-[#2a2a32]"
                >
                  <span
                    className={`text-[10px] uppercase tracking-widest font-semibold w-20 ${
                      r.status === "approved"
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {r.status}
                  </span>
                  <span className="text-sm font-semibold truncate flex-1">
                    {r.profile.nickname}
                  </span>
                  {r.rejectionReason && (
                    <span
                      className="text-[11px] text-gray-400 italic truncate max-w-[200px]"
                      title={r.rejectionReason}
                    >
                      {r.rejectionReason}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500 shrink-0">
                    by {r.reviewer?.nickname ?? "—"}
                  </span>
                  <span className="text-[10px] text-gray-500 shrink-0">
                    {r.reviewedAt
                      ? new Date(r.reviewedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
