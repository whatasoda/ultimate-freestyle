import { readStreamCapped } from "../lib/http";
import {
  IMAGE_INPUT_PIXELS_LIMIT,
  IMAGE_INPUT_SIDE_LIMIT,
  IMAGE_OUTPUT_BYTES_LIMIT,
  IMAGE_OUTPUT_SIDE_LIMIT,
  IMAGE_WEBP_QUALITY
} from "./schema";

const ACCEPTED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export type ImagePolicyErrorCode =
  | "IMAGE_TYPE_UNSUPPORTED"
  | "IMAGE_ANIMATED_UNSUPPORTED"
  | "IMAGE_INVALID"
  | "IMAGE_DIMENSIONS_TOO_LARGE"
  | "IMAGE_OUTPUT_TOO_LARGE";

export class ImagePolicyError extends Error {
  constructor(
    readonly code: ImagePolicyErrorCode,
    message: string
  ) {
    super(message);
  }
}

export type NormalizedImage = {
  bytes: Uint8Array;
  mimeType: "image/webp";
  width: number;
  height: number;
};

function byteStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  const copied = bytes.slice();
  return new Blob([copied.buffer]).stream();
}

function assertInputFormat(format: string | undefined): void {
  const normalized = format?.toLowerCase() ?? "";
  if (
    normalized !== "image/jpeg" &&
    normalized !== "jpeg" &&
    normalized !== "jpg" &&
    normalized !== "image/png" &&
    normalized !== "png" &&
    normalized !== "image/webp" &&
    normalized !== "webp"
  ) {
    throw new ImagePolicyError(
      "IMAGE_TYPE_UNSUPPORTED",
      "JPEG、PNG、静止WebPだけをアップロードできます。"
    );
  }
}

export function assertDeclaredImageType(contentType: string): void {
  if (!ACCEPTED_CONTENT_TYPES.has(contentType.toLowerCase())) {
    throw new ImagePolicyError(
      "IMAGE_TYPE_UNSUPPORTED",
      "JPEG、PNG、静止WebPだけをアップロードできます。"
    );
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

export function assertImageIsNotAnimated(bytes: Uint8Array): void {
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
      const kind = ascii(bytes, offset, 4);
      const size =
        bytes[offset + 4]! |
        (bytes[offset + 5]! << 8) |
        (bytes[offset + 6]! << 16) |
        (bytes[offset + 7]! << 24);
      if (kind === "ANIM" || (kind === "VP8X" && (bytes[offset + 8]! & 0x02) !== 0)) {
        throw new ImagePolicyError(
          "IMAGE_ANIMATED_UNSUPPORTED",
          "アニメーション画像には対応していません。静止画像を選んでください。"
        );
      }
      if (size < 0 || offset + 8 + size > bytes.byteLength) break;
      offset += 8 + size + (size % 2);
    }
  }
  if (
    bytes.byteLength >= 8 &&
    ascii(bytes, 1, 3) === "PNG"
  ) {
    for (let offset = 8; offset + 12 <= bytes.byteLength; ) {
      const size =
        bytes[offset]! * 0x1000000 +
        bytes[offset + 1]! * 0x10000 +
        bytes[offset + 2]! * 0x100 +
        bytes[offset + 3]!;
      if (ascii(bytes, offset + 4, 4) === "acTL") {
        throw new ImagePolicyError(
          "IMAGE_ANIMATED_UNSUPPORTED",
          "アニメーション画像には対応していません。静止画像を選んでください。"
        );
      }
      if (offset + 12 + size > bytes.byteLength) break;
      offset += 12 + size;
    }
  }
}

export async function normalizeProjectImage(
  images: ImagesBinding,
  bytes: Uint8Array
): Promise<NormalizedImage> {
  assertImageIsNotAnimated(bytes);
  let info: ImageInfoResponse;
  try {
    info = await images.info(byteStream(bytes));
  } catch {
    throw new ImagePolicyError(
      "IMAGE_INVALID",
      "画像を解析できませんでした。破損していないファイルを選んでください。"
    );
  }
  assertInputFormat(info.format);
  if (!("width" in info) || !("height" in info)) {
    throw new ImagePolicyError(
      "IMAGE_TYPE_UNSUPPORTED",
      "JPEG、PNG、静止WebPだけをアップロードできます。"
    );
  }
  if (
    info.width <= 0 ||
    info.height <= 0 ||
    info.width > IMAGE_INPUT_SIDE_LIMIT ||
    info.height > IMAGE_INPUT_SIDE_LIMIT ||
    info.width * info.height > IMAGE_INPUT_PIXELS_LIMIT
  ) {
    throw new ImagePolicyError(
      "IMAGE_DIMENSIONS_TOO_LARGE",
      "画像の解像度が上限を超えています。最大40メガピクセル・一辺10000pxです。"
    );
  }

  const scale = Math.min(
    1,
    IMAGE_OUTPUT_SIDE_LIMIT / info.width,
    IMAGE_OUTPUT_SIDE_LIMIT / info.height
  );
  const targetWidth = Math.max(1, Math.round(info.width * scale));
  const targetHeight = Math.max(1, Math.round(info.height * scale));

  let response: Response;
  try {
    let transformer = images.input(byteStream(bytes));
    if (scale < 1) {
      transformer = transformer.transform({
        width: targetWidth,
        height: targetHeight
      });
    }
    response = (
      await transformer
        .output({
          format: "image/webp",
          quality: IMAGE_WEBP_QUALITY,
          anim: false
        })
    ).response();
  } catch {
    throw new ImagePolicyError(
      "IMAGE_INVALID",
      "画像を変換できませんでした。別のファイルを選んでください。"
    );
  }
  if (!response.ok) {
    throw new ImagePolicyError(
      "IMAGE_INVALID",
      "画像を変換できませんでした。別のファイルを選んでください。"
    );
  }
  const declaredLength = response.headers.has("content-length")
    ? Number(response.headers.get("content-length"))
    : null;
  const output = await readStreamCapped(
    response.body,
    IMAGE_OUTPUT_BYTES_LIMIT,
    declaredLength
  );
  if (!output.ok) {
    throw new ImagePolicyError(
      "IMAGE_OUTPUT_TOO_LARGE",
      "圧縮後の画像が2MiBを超えました。より小さい画像を選んでください。"
    );
  }

  const outputInfo = await images.info(byteStream(output.value));
  if (!("width" in outputInfo) || !("height" in outputInfo)) {
    throw new ImagePolicyError("IMAGE_INVALID", "変換後の画像を検証できませんでした。");
  }
  return {
    bytes: output.value,
    mimeType: "image/webp",
    width: outputInfo.width,
    height: outputInfo.height
  };
}
