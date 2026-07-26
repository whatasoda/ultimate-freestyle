import { z } from "zod";

export const PROJECT_IMAGE_LIMIT = 100;
export const USER_IMAGE_LIMIT = 300;
export const USER_IMAGE_BYTES_LIMIT = 150 * 1024 * 1024;
export const IMAGE_INPUT_BYTES_LIMIT = 10 * 1024 * 1024;
export const IMAGE_OUTPUT_BYTES_LIMIT = 2 * 1024 * 1024;
export const IMAGE_INPUT_PIXELS_LIMIT = 40_000_000;
export const IMAGE_INPUT_SIDE_LIMIT = 10_000;
export const IMAGE_OUTPUT_SIDE_LIMIT = 2_560;
export const IMAGE_WEBP_QUALITY = 85;

export const projectAssetSchema = z.object({
  asset_id: z.string().uuid(),
  project_id: z.string().uuid(),
  original_filename: z.string().min(1).max(255),
  alt_text: z.string().max(500),
  mime_type: z.literal("image/webp"),
  width: z.number().int().positive().max(IMAGE_OUTPUT_SIDE_LIMIT),
  height: z.number().int().positive().max(IMAGE_OUTPUT_SIDE_LIMIT),
  byte_size: z.number().int().positive().max(IMAGE_OUTPUT_BYTES_LIMIT),
  content_url: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime()
});

export type ProjectAsset = z.infer<typeof projectAssetSchema>;

export type StoredProjectAsset = ProjectAsset & {
  owner_user_id: string;
  object_key: string;
};
