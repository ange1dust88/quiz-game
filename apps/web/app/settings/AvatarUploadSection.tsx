"use client";

// Upload + status panel for avatars. Shows the currently-approved avatar,
// any pending or recently rejected submission, and a file picker that
// posts to the uploadAvatar server action. We block re-uploads while a
// submission is pending so the admin queue doesn't fill with duplicates.

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  uploadAvatar,
  type AvatarUploadState,
} from "@/app/lib/avatarActions";
import PanelCard from "@/app/components/ui/PanelCard";

const AVATAR_UPLOAD_INITIAL: AvatarUploadState = { error: null, ok: false };

type LatestSubmission = {
  status: string;
  publicUrl: string;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
} | null;

type Props = {
  nickname: string;
  currentAvatarUrl: string | null;
  latestSubmission: LatestSubmission;
};

export default function AvatarUploadSection({
  nickname,
  currentAvatarUrl,
  latestSubmission,
}: Props) {
  const [state, formAction] = useActionState<AvatarUploadState, FormData>(
    uploadAvatar,
    AVATAR_UPLOAD_INITIAL,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPick = (file: File | null) => {
    setFilename(file?.name ?? null);
    if (!file) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const isPending = latestSubmission?.status === "pending";
  const wasRejected = latestSubmission?.status === "rejected";
  // After a successful submit the server has stamped a new pending row
  // for this user — but the page hasn't re-rendered with the new prop
  // yet. Treat ok=true as locally-pending too.
  const lockUploads = isPending || state.ok;

  return (
    <PanelCard
      title="Avatar"
      accent="#ffc24a"
      right={
        <span className="font-mono text-[10px] text-dim">
          Reviewed by admin before going live
        </span>
      }
    >
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex flex-col items-center gap-1">
          <div className="w-20 h-20 overflow-hidden flex items-center justify-center text-2xl font-bold shrink-0 bg-canvas border border-stroke">
            {currentAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatarUrl}
                alt={nickname}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-head text-accent">
                {nickname.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <span className="font-head text-[10px] text-dim">Current</span>
        </div>

        {preview && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-20 h-20 overflow-hidden bg-canvas border border-gold flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="preview"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-head text-[10px] text-gold">Preview</span>
          </div>
        )}

        <div className="flex-1 min-w-0 md:min-w-[200px] flex flex-col gap-2">
          {state.ok && (
            <p className="font-mono text-[11px] text-win">
              Uploaded! Your avatar is queued for admin review.
            </p>
          )}
          {state.error && (
            <p className="font-mono text-[11px] text-lose">{state.error}</p>
          )}
          {isPending && !state.ok && (
            <p className="font-mono text-[11px] text-gold">
              Submission waiting on review (uploaded{" "}
              {new Date(latestSubmission!.createdAt).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              )}
              ). New uploads are locked until it&apos;s processed.
            </p>
          )}
          {wasRejected && !state.ok && (
            <p className="font-mono text-[11px] text-lose">
              Last submission was rejected:{" "}
              <span className="italic">
                {latestSubmission?.rejectionReason ?? "no reason given"}
              </span>
              . Pick a different image and try again.
            </p>
          )}

          <form action={formAction} className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              name="avatar"
              accept="image/png,image/jpeg,image/webp"
              disabled={lockUploads}
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              className="font-mono text-xs text-mute file:mr-3 file:py-1.5 file:px-3 file:border-0 file:bg-accent file:text-accent-fg file:font-head file:text-[10px] file:cursor-pointer hover:file:bg-accent-dim disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <SubmitRow
              hasFile={Boolean(filename)}
              filename={filename}
              disabled={lockUploads}
            />
          </form>
          <p className="font-mono text-[10px] text-dim">
            PNG / JPEG / WEBP, up to 2MB. Square images look best.
          </p>
        </div>
      </div>
    </PanelCard>
  );
}

function SubmitRow({
  hasFile,
  filename,
  disabled,
}: {
  hasFile: boolean;
  filename: string | null;
  disabled: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-2">
      <button
        type="submit"
        disabled={disabled || !hasFile || pending}
        className="font-head text-[11px] font-extrabold text-white bg-accent hover:bg-accent-dim transition-colors px-4 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-stroke"
      >
        {pending ? "Uploading…" : "Submit for review"}
      </button>
      {filename && (
        <span className="font-mono text-[11px] text-mute truncate">
          {filename}
        </span>
      )}
    </div>
  );
}
