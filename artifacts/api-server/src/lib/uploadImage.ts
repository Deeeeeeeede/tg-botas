import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function uploadImage(buffer: Buffer): Promise<string> {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(fileName, buffer, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (error) {
    console.error("Upload error:", error);
    throw new Error("Upload failed");
  }

  const { data: publicUrl } = supabase.storage
    .from("uploads")
    .getPublicUrl(data.path);

  return publicUrl.publicUrl;
}
