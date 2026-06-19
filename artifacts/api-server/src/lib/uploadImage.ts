import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./logger";

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env["SUPABASE_URL"];
    const supabaseKey = process.env["SUPABASE_KEY"];

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_KEY environment variables must be set to use image uploads.",
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  return supabase;
}

export async function uploadImage(buffer: Buffer): Promise<string> {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  let client: SupabaseClient;
  try {
    client = getSupabaseClient();
  } catch (err) {
    logger.error({ err }, "Supabase client init failed — SUPABASE_URL / SUPABASE_KEY not set");
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
