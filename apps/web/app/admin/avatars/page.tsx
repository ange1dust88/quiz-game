// FACEIT-style admin moderation queue for avatar submissions. Same admin
// gating as /analytics — comma-separated email list in ADMIN_EMAILS.
// Non-admins get redirected to dashboard. Pending submissions are shown
// oldest-first so the queue feels like FIFO when an admin works through
// it.
//
// Approve and Reject are both POST forms hitting server actions which
// move the file in Supabase Storage and update the AvatarSubmission row.

import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfileSafe } from "@/app/lib/auth";
import { approveAvatar, rejectAvatar } from "@/app/lib/avatarActions";
import PanelCard from "@/app/components/ui/PanelCard";
import Slash from "@/app/components/ui/Slash";

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
    <div className="min-h-[calc(100vh-4rem)] text-white bg-canvas">
      <section className="relative overflow-hidden border-b border-stroke bg-gradient-to-br from-surface-hi via-panel to-canvas">
        <div
          className="absolute right-[-80px] top-0 bottom-0 w-[200px] bg-purple2/10"
          style={{ transform: "skewX(-12deg)" }}
          aria-hidden
        />
        <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-2">
            <Slash label="Moderation" color="#ff6cf3" />
            <h1 className="font-head text-4xl text-white leading-none">
              AVATAR REVIEWS
            </h1>
          </div>
          <Link
            href="/dashboard"
            className="font-head text-[11px] text-mute hover:text-white border border-stroke hover:border-mute transition-colors px-4 py-2"
          >
            ← Dashboard
          </Link>
        </div>
      </section>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
        <PanelCard
          title={`Pending queue · ${pending.length}`}
          accent="#ffc24a"
        >
          {pending.length === 0 ? (
            <p className="font-body text-sm text-dim text-center py-6">
              Nothing to review — queue is empty.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pending.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 bg-panel border border-stroke p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-20 overflow-hidden bg-canvas border border-stroke shrink-0">
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
                        className="font-head text-sm text-white hover:text-accent truncate transition-colors"
                      >
                        {p.profile.nickname.toUpperCase()}
                      </Link>
                      <span className="font-mono text-[11px] text-dim mt-0.5">
                        submitted{" "}
                        {new Date(p.createdAt).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {p.profile.avatarUrl && (
                        <span className="font-head text-[9px] text-gold mt-1">
                          REPLACES CURRENT
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <form action={approveAvatar} className="flex-1">
                      <input type="hidden" name="submissionId" value={p.id} />
                      <button
                        type="submit"
                        className="w-full font-head text-xs font-extrabold text-accent-fg bg-win hover:opacity-90 transition-opacity px-3 py-1.5"
                      >
                        Approve
                      </button>
                    </form>
                    <form
                      action={rejectAvatar}
                      className="flex-1 flex gap-1"
                    >
                      <input type="hidden" name="submissionId" value={p.id} />
                      <input
                        type="text"
                        name="reason"
                        placeholder="reason (optional)"
                        maxLength={200}
                        className="flex-1 min-w-0 font-mono text-xs bg-canvas border border-stroke focus:border-lose focus:outline-none px-2 py-1.5 text-white placeholder:text-dim"
                      />
                      <button
                        type="submit"
                        className="font-head text-xs text-lose bg-lose/15 hover:bg-lose/25 border border-lose/40 px-3 py-1.5 shrink-0 transition-colors"
                      >
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <PanelCard title="Recent decisions" accent="#7c8aff" padded={false}>
          {recent.length === 0 ? (
            <p className="font-body text-sm text-dim text-center py-6">
              No decisions yet.
            </p>
          ) : (
            <div>
              {recent.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-2 border-t border-stroke first:border-t-0"
                >
                  <span
                    className="font-head text-[10px] w-20"
                    style={{
                      color:
                        r.status === "approved"
                          ? "var(--color-win)"
                          : "var(--color-lose)",
                    }}
                  >
                    {r.status.toUpperCase()}
                  </span>
                  <span className="font-head text-xs text-white truncate flex-1">
                    {r.profile.nickname.toUpperCase()}
                  </span>
                  {r.rejectionReason && (
                    <span
                      className="font-mono text-[11px] text-mute italic truncate max-w-[200px]"
                      title={r.rejectionReason}
                    >
                      {r.rejectionReason}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-dim shrink-0">
                    by {r.reviewer?.nickname ?? "—"}
                  </span>
                  <span className="font-mono text-[10px] text-dim shrink-0">
                    {r.reviewedAt
                      ? new Date(r.reviewedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}
