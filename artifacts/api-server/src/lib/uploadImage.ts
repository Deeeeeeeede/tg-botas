import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

let supabase: SupabaseClient | null = null;

/** Resolve env vars — Railway uses NEXT_PUBLIC_ prefix, plain names are fallback */
function resolveEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = process.env[key];
    if (val) return val;
  }
  return undefined;
}

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = resolveEnv(
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    );
    const supabaseKey = resolveEnv(
      "SUPABASE_KEY",
      "SUPABASE_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        `Supabase env vars not set. Tried URLs: SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL. ` +
        `Tried keys: SUPABASE_KEY, SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.`,
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  return supabase;
}

export async function uploadImage(buffer: Buffer): Promise<string> {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  let client: SupabaseClient;
  try {
    client = getSupabaseClient();
  } catch (err) {
    logger.error({ err }, "Supabase client init failed");
    throw err;
  }

  const { data, error } = await client.storage
    .from("uploads")
    .upload(fileName, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    logger.error({ error, fileName }, "Supabase storage upload failed");
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data: publicUrlData } = client.storage
    .from("uploads")
    .getPublicUrl(data.path);

  logger.info({ path: data.path, url: publicUrlData.publicUrl }, "Image uploaded to Supabase");

  return publicUrlData.publicUrl;
}
