import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function uploadImage(buffer: Buffer) {
  const fileName = `${randomUUID()}.jpg`;

  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(`images/${fileName}`, buffer, {
      contentType: "image/jpeg",
    });

  if (error) throw error;

  const { data: url } = supabase.storage
    .from("uploads")
    .getPublicUrl(data.path);

  return url.publicUrl;
}