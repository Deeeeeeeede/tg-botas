import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_KEY environment variables are required to upload images.",
      );
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }

  return supabase;
}

export async function uploadImage(buffer: Buffer): Promise<string> {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const supabaseClient = getSupabaseClient();

  const { data, error } = await supabaseClient.storage
    .from("uploads")
    .upload(fileName, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    console.error("Upload error:", error);
    throw new Error("Upload failed");
  }

  const { data: publicUrl } = supabaseClient.storage
    .from("uploads")
    .getPublicUrl(data.path);

  return publicUrl.publicUrl;
}
