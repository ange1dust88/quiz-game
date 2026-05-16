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

const INITIAL_BG = "bg-gradient-to-br from-blue-400 to-blue-500";

export default function AvatarUploadSection({
  nickname,
  currentAvatarUrl,
  latestSubmission,
}: Props) {
  const [state, formAction] = useActionState<AvatarUploadState, FormData>(
    uploadAvatar,
    AVATAR_UPLOAD_INITIAL,
  );
  // Local preview before submit so the user sees what they picked.
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
    <section className="bg-[#1a1a1a]/70 backdrop-blur border border-[#4f4f4f] rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Avatar</h2>
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
          Reviewed by admin before going live
        </span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex flex-col items-center gap-1">
          <div
            className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center text-3xl font-bold shrink-0 ${
              currentAvatarUrl ? "bg-[#1f1f24]" : INITIAL_BG
            }`}
          >
            {currentAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatarUrl}
                alt={nickname}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{nickname.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">
            Current
          </span>
        </div>

        {preview && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-[#1f1f24] flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="preview"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-amber-300">
              Preview
            </span>
          </div>
        )}

        <div className="flex-1 min-w-[200px] flex flex-col gap-2">
          {state.ok && (
            <p className="text-xs text-emerald-300">
              Uploaded! Your avatar is queued for admin review.
            </p>
          )}
          {state.error && (
            <p className="text-xs text-red-400">{state.error}</p>
          )}
          {isPending && !state.ok && (
            <p className="text-xs text-amber-300">
              You have a submission waiting on review (uploaded{" "}
              {new Date(latestSubmission!.createdAt).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              )}
              ). New uploads are locked until it's processed.
            </p>
          )}
          {wasRejected && !state.ok && (
            <p className="text-xs text-red-300">
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
              className="text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-blue-400 file:text-white file:font-semibold hover:file:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <SubmitRow
              hasFile={Boolean(filename)}
              filename={filename}
              disabled={lockUploads}
            />
          </form>
          <p className="text-[10px] text-gray-500">
            PNG / JPEG / WEBP, up to 2MB. Square images look best.
          </p>
        </div>
      </div>
    </section>
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
        className="text-sm bg-blue-400 hover:bg-blue-500 transition-colors text-white px-4 py-1.5 rounded-md font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Uploading…" : "Submit for review"}
      </button>
      {filename && (
        <span className="text-[11px] text-gray-400 truncate">{filename}</span>
      )}
    </div>
  );
}
