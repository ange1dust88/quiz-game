// Server-only Supabase client using the service-role key — needed for
// privileged operations like uploading to the `avatars` bucket on behalf
// of the user without exposing the key to the browser. Only import this
// from files marked "use server" or route handlers.

import { createClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createClient> | null = null;

export function supabaseServer() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const AVATAR_BUCKET = "avatars";

// Idempotent — calling this when the bucket already exists is a no-op.
// We make the bucket public so img URLs don't need signed-url wrangling
// on every render. Pending uploads still live in `pending/` and the
// public UI only ever references `approved/` URLs.
export async function ensureAvatarBucket(): Promise<void> {
  const supabase = supabaseServer();
  const { data } = await supabase.storage.getBucket(AVATAR_BUCKET);
  if (data) return;
  await supabase.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024, // 2 MB
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
}
