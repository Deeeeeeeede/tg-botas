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

type UploadOptions = {
  /** Telegram file type: "photo" | "video" | "animation" | "document" */
  fileType?: string;
  /** Raw MIME type from Telegram (e.g. msg.document.mime_type, msg.video.mime_type).
   *  Takes priority over fileType for content-type and extension resolution. */
  mimeType?: string;
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

function resolveContentTypeAndExt(
  fileType?: string,
  mimeType?: string,
): { contentType: string; ext: string } {
  if (mimeType) {
    return { contentType: mimeType, ext: MIME_TO_EXT[mimeType] ?? "bin" };
  }
  switch (fileType) {
    case "video":     return { contentType: "video/mp4",              ext: "mp4" };
    case "animation": return { contentType: "video/mp4",              ext: "mp4" };
    case "document":  return { contentType: "application/octet-stream", ext: "bin" };
    case "photo":
    default:          return { contentType: "image/jpeg",             ext: "jpg" };
  }
}

export async function uploadImage(buffer: Buffer, options?: UploadOptions): Promise<string> {
  const { contentType, ext } = resolveContentTypeAndExt(options?.fileType, options?.mimeType);
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

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
      contentType,
      upsert: false,
    });

  if (error) {
    logger.error({ error, fileName }, "Supabase storage upload failed");
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: publicUrlData } = client.storage
    .from("uploads")
    .getPublicUrl(data.path);

  logger.info({ path: data.path, url: publicUrlData.publicUrl, contentType }, "File uploaded to Supabase");

  return publicUrlData.publicUrl;
}
