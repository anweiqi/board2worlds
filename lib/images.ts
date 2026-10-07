import { promises as fs } from "fs";
import path from "path";

export interface LoadedImage {
  source: string;
  bytes: Buffer;
  mime: string;
  ext: "jpg" | "png" | "webp";
}

function mimeFromBytes(buf: Buffer, fallback: string): string {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return fallback;
}

function extFromMime(mime: string): LoadedImage["ext"] {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

/**
 * Load an image from an http(s) URL or from a public path like /board/pin-01.jpg
 * or /generated/<run>/scene.png.
 */
export async function loadImage(source: string): Promise<LoadedImage> {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, {
      headers: {
        // Pinterest CDN is fine without referer, but some hosts want a UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${source}: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime = mimeFromBytes(bytes, res.headers.get("content-type") || "image/jpeg");
    return { source, bytes, mime, ext: extFromMime(mime) };
  }
  if (source.startsWith("/")) {
    const safe = path.normalize(source).replace(/^(\.\.[/\\])+/, "");
    const abs = path.join(process.cwd(), "public", safe);
    if (!abs.startsWith(path.join(process.cwd(), "public"))) {
      throw new Error("invalid public path");
    }
    const bytes = await fs.readFile(abs);
    const mime = mimeFromBytes(bytes, "image/jpeg");
    return { source, bytes, mime, ext: extFromMime(mime) };
  }
  throw new Error(`Unsupported image source: ${source}`);
}

export function toDataUrl(img: LoadedImage) {
  return `data:${img.mime};base64,${img.bytes.toString("base64")}`;
}

export function parseImageList(text: string): string[] {
  return text
    .split(/\r?\n|,\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (/^https?:\/\//i.test(s) || s.startsWith("/")));
}
