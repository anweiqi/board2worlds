import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { list, put } from "@vercel/blob";
import type { Run } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "runs");

function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function runPath(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("invalid run id");
  return path.join(DATA_DIR, `${id}.json`);
}

export function newRunId() {
  return randomUUID().slice(0, 8);
}

export async function saveRun(run: Run): Promise<Run> {
  run.updated_at = new Date().toISOString();
  const body = JSON.stringify(run, null, 2);
  if (blobEnabled()) {
    await put(`runs/${run.id}.json`, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return run;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(runPath(run.id), body);
  return run;
}

export async function loadRun(id: string): Promise<Run | null> {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return null;
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: `runs/${id}.json`, limit: 1 });
    const match = blobs.find((b) => b.pathname === `runs/${id}.json`);
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Run;
  }
  try {
    const raw = await fs.readFile(runPath(id), "utf8");
    return JSON.parse(raw) as Run;
  } catch {
    return null;
  }
}

export async function listRuns(): Promise<Run[]> {
  if (blobEnabled()) {
    const { blobs } = await list({ prefix: "runs/", limit: 100 });
    const runs: Run[] = [];
    await Promise.all(
      blobs
        .filter((b) => b.pathname.endsWith(".json"))
        .map(async (b) => {
          try {
            const res = await fetch(b.url, { cache: "no-store" });
            if (res.ok) runs.push((await res.json()) as Run);
          } catch {
            // skip
          }
        }),
    );
    return runs.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const files = await fs.readdir(DATA_DIR);
  const runs: Run[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      runs.push(JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8")));
    } catch {
      // skip corrupt files
    }
  }
  return runs.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Save a generated image; returns a public URL or /generated/... path. */
export async function saveGeneratedImage(
  runId: string,
  fileName: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  if (blobEnabled()) {
    const blob = await put(`generated/${runId}/${fileName}`, bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    });
    return blob.url;
  }
  const dir = path.join(process.cwd(), "public", "generated", runId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, fileName), bytes);
  return `/generated/${runId}/${fileName}`;
}
