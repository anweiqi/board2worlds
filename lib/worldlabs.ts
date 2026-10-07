import type { LoadedImage } from "./images";
import type { WorldResult } from "./types";

const BASE = "https://api.worldlabs.ai/marble/v1";
export const WORLDLABS_MODEL = process.env.WORLDLABS_MODEL || "marble-1.1";

function apiKey() {
  const key = process.env.WORLDLABS_API_KEY;
  if (!key) throw new Error("WORLDLABS_API_KEY is not set (add it to .env.local)");
  return key;
}

async function wl<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "WLT-Api-Key": apiKey(),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`World Labs ${init.method || "GET"} ${path} -> ${res.status}: ${text}`);
  }
  return JSON.parse(text) as T;
}

interface PrepareUploadResponse {
  media_asset: { id: string };
  upload_info: {
    upload_url: string;
    upload_method: string;
    required_headers?: Record<string, string>;
  };
}

/** Upload image bytes as a media asset; returns media_asset_id. */
export async function uploadMediaAsset(img: LoadedImage, fileName: string): Promise<string> {
  const prep = await wl<PrepareUploadResponse>("/media-assets:prepare_upload", {
    method: "POST",
    body: JSON.stringify({ file_name: fileName, kind: "image", extension: img.ext }),
  });
  const put = await fetch(prep.upload_info.upload_url, {
    method: prep.upload_info.upload_method || "PUT",
    headers: {
      ...(prep.upload_info.required_headers || {}),
      "Content-Type": img.mime,
    },
    body: new Uint8Array(img.bytes),
  });
  if (!put.ok) {
    throw new Error(`Media upload failed: ${put.status} ${await put.text()}`);
  }
  return prep.media_asset.id;
}

export interface Operation {
  operation_id: string;
  done: boolean;
  error?: { message?: string; code?: string | number } | null;
  metadata?: {
    progress?: { status?: string; description?: string };
    world_id?: string;
  } | null;
  response?: WorldResult | null;
}

export async function generateWorld(opts: {
  displayName: string;
  mediaAssetId: string;
  textPrompt?: string;
  model?: string;
}): Promise<Operation> {
  return wl<Operation>("/worlds:generate", {
    method: "POST",
    body: JSON.stringify({
      display_name: opts.displayName,
      model: opts.model || WORLDLABS_MODEL,
      world_prompt: {
        type: "image",
        image_prompt: { source: "media_asset", media_asset_id: opts.mediaAssetId },
        ...(opts.textPrompt ? { text_prompt: opts.textPrompt } : {}),
        // is_pano left at default "auto": our 3:2 / portrait inputs are never
        // detected as equirectangular panoramas.
      },
    }),
  });
}

export async function getOperation(id: string): Promise<Operation> {
  return wl<Operation>(`/operations/${encodeURIComponent(id)}`);
}

export async function getWorld(id: string): Promise<WorldResult> {
  const data = await wl<{ world: WorldResult }>(`/worlds/${encodeURIComponent(id)}`);
  return data.world;
}

export async function getCredits(): Promise<unknown> {
  return wl<unknown>("/credits");
}
