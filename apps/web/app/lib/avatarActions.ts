"use server";

// Avatar upload + admin moderation actions. Self-uploads go into a
// `pending/` folder and an AvatarSubmission row is created with
// status="pending"; the admin queue at /admin/avatars surfaces these
// for review. Approving promotes the file to `approved/` and updates
// PlayerProfile.avatarUrl. Rejecting deletes the file and records a
// reason. Admin gating reuses the same ADMIN_EMAILS env list as
// /analytics.

import { randomUUID } from "crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@quiz/db";
import { getProfile } from "@/app/lib/auth";
import {
  AVATAR_BUCKET,
  ensureAvatarBucket,
  supabaseServer,
} from "@/app/lib/supabase/server";

// Caps for the *incoming* upload. We re-encode server-side after this
// check (see sharp call below), so the on-disk file ends up at ~30-60KB
// regardless of what the user sent. Keeping the pre-check generous lets
// users drag a photo straight off their phone without converting first;
// the hard ceiling is just for sanity (DoS / running out of memory).
const MAX_INCOMING_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
// Final output is always JPEG — sharp re-encodes from raw pixels which
// also conveniently strips EXIF / hidden metadata, blocks polyglot
// PNG-with-html attacks, and gets us consistent file sizes.
const OUTPUT_SIZE_PX = 256;
const OUTPUT_QUALITY = 82;
const OUTPUT_EXT = "jpg";
const OUTPUT_CONTENT_TYPE = "image/jpeg";

export type AvatarUploadState = {
  error: string | null;
  ok: boolean;
};

function isAdmin(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

async function getAdminProfileOrThrow() {
  const profile = await getProfile();
  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { email: true },
  });
  if (!user || !isAdmin(user.email)) {
    throw new Error("Admin only");
  }
  return profile;
}

export async function uploadAvatar(
  _prev: AvatarUploadState,
  formData: FormData,
): Promise<AvatarUploadState> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Pick an image to upload.", ok: false };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Only PNG, JPEG or WEBP allowed.", ok: false };
  }
  if (file.size > MAX_INCOMING_BYTES) {
    return {
      error: `File too large — max ${Math.round(MAX_INCOMING_BYTES / 1024 / 1024)}MB.`,
      ok: false,
    };
  }

  const profile = await getProfile();

  // One in-flight pending submission per user — don't queue stack.
  const existingPending = await prisma.avatarSubmission.findFirst({
    where: { profileId: profile.id, status: "pending" },
  });
  if (existingPending) {
    return {
      error:
        "You already have a pending submission. Wait for admin review or contact us if it's stuck.",
      ok: false,
    };
  }

  // If the server-side Supabase client isn't configured (missing env
  // var), return a friendly error instead of throwing into the error
  // boundary.
  try {
    await ensureAvatarBucket();
  } catch (err) {
    console.error("[avatar] bucket setup failed", err);
    return {
      error:
        "Avatar upload isn't configured on this server yet. Try again later.",
      ok: false,
    };
  }
  let supabase;
  try {
    supabase = supabaseServer();
  } catch (err) {
    console.error("[avatar] server client init failed", err);
    return {
      error:
        "Avatar upload isn't configured on this server yet. Try again later.",
      ok: false,
    };
  }

  const submissionId = randomUUID();
  const storagePath = `pending/${submissionId}.${OUTPUT_EXT}`;
  const rawBytes = Buffer.from(await file.arrayBuffer());

  // Server-side normalise: re-encode through sharp so we always get a
  // 256×256 JPEG (~30-60KB). Side effects of going through pixel data:
  //   - any embedded EXIF / colour-profile metadata is dropped
  //   - polyglot files (e.g. PNG-headed HTML) lose their second face
  //   - file size becomes predictable regardless of source resolution
  let processed: Buffer;
  try {
    processed = await sharp(rawBytes)
      .rotate() // honour orientation EXIF before stripping it
      .resize(OUTPUT_SIZE_PX, OUTPUT_SIZE_PX, { fit: "cover" })
      .jpeg({ quality: OUTPUT_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (err) {
    console.error("[avatar] sharp re-encode failed", err);
    return {
      error: "Couldn't read that image. Try a different file.",
      ok: false,
    };
  }

  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, processed, {
      contentType: OUTPUT_CONTENT_TYPE,
      upsert: false,
    });
  if (uploadErr) {
    console.error("[avatar] upload failed", uploadErr);
    return { error: "Upload failed. Try again.", ok: false };
  }

  const { data: pub } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(storagePath);

  await prisma.avatarSubmission.create({
    data: {
      profileId: profile.id,
      storagePath,
      publicUrl: pub.publicUrl,
      status: "pending",
    },
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

export async function approveAvatar(formData: FormData) {
  const id = String(formData.get("submissionId") ?? "");
  if (!id) return;
  const admin = await getAdminProfileOrThrow();

  const sub = await prisma.avatarSubmission.findUnique({ where: { id } });
  if (!sub || sub.status !== "pending") return;

  const supabase = supabaseServer();
  const ext = sub.storagePath.split(".").pop() ?? "png";
  // Stable per-profile filename — overwrites the previous approved
  // avatar so old URLs stop resolving (and don't leak).
  const approvedPath = `approved/${sub.profileId}.${ext}`;

  // Move = copy + delete. Supabase has `move` but it doesn't overwrite,
  // so we copy-with-upsert then remove the pending file.
  const { data: download, error: downloadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .download(sub.storagePath);
  if (downloadErr || !download) {
    console.error("[avatar] download for approve failed", downloadErr);
    return;
  }
  const bytes = new Uint8Array(await download.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(approvedPath, bytes, {
      contentType: download.type || "image/png",
      upsert: true,
    });
  if (uploadErr) {
    console.error("[avatar] upload to approved failed", uploadErr);
    return;
  }
  await supabase.storage.from(AVATAR_BUCKET).remove([sub.storagePath]);

  // Public URL with a cache-buster so the new image displays right
  // away even if browsers cached the old one.
  const { data: pub } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(approvedPath);
  const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

  await prisma.$transaction([
    prisma.avatarSubmission.update({
      where: { id },
      data: {
        status: "approved",
        storagePath: approvedPath,
        publicUrl,
        reviewedAt: new Date(),
        reviewerProfileId: admin.id,
      },
    }),
    prisma.playerProfile.update({
      where: { id: sub.profileId },
      data: { avatarUrl: publicUrl },
    }),
  ]);

  revalidatePath("/admin/avatars");
  revalidatePath("/", "layout");
}

export async function rejectAvatar(formData: FormData) {
  const id = String(formData.get("submissionId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  if (!id) return;
  // Caller is enforced as admin even though we don't currently
  // reference the result — guarantees only admins can drop rows.
  await getAdminProfileOrThrow();

  const sub = await prisma.avatarSubmission.findUnique({ where: { id } });
  if (!sub || sub.status !== "pending") return;

  // Delete the file from Storage and the row from the DB. We don't keep
  // rejected rows around — the user just re-submits if they want, and we
  // don't accumulate audit baggage. The rejection reason is surfaced
  // through a transient MatchEvent-style flash on /settings next time
  // the rejected user visits (see below).
  const supabase = supabaseServer();
  await supabase.storage.from(AVATAR_BUCKET).remove([sub.storagePath]);

  // Stash the rejection reason on the *next* admin-decision row insertion
  // path: in practice the user opens /settings and sees an empty upload
  // form again. To still tell them why their previous attempt was
  // dropped, we briefly write the reason into a flash row that the
  // settings query reads — implemented as an AvatarSubmission with
  // status="rejected" + a 1-day TTL handled by the startup cleanup.
  // For v1 we simply delete and rely on the admin to communicate out-
  // of-band if the reason matters. Comment kept for the next iteration.
  console.log(
    `[avatar] rejected ${id} (profile=${sub.profileId}, reason="${reason}")`,
  );

  await prisma.avatarSubmission.delete({ where: { id } });

  revalidatePath("/admin/avatars");
  revalidatePath("/settings");
}

// Used by the settings page after a successful submission to redirect
// to the profile. Separate because react-server-actions can't easily
// chain a redirect onto the action state result above.
export async function finishAvatarUpload(nickname: string) {
  redirect(`/profile/${encodeURIComponent(nickname)}`);
}
