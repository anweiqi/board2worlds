import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Run } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "runs");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function runPath(id: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("invalid run id");
  return path.join(DATA_DIR, `${id}.json`);
}

export function newRunId() {
  return randomUUID().slice(0, 8);
}

export async function saveRun(run: Run): Promise<Run> {
  await ensureDir();
  run.updated_at = new Date().toISOString();
  await fs.writeFile(runPath(run.id), JSON.stringify(run, null, 2));
  return run;
}

export async function loadRun(id: string): Promise<Run | null> {
  try {
    const raw = await fs.readFile(runPath(id), "utf8");
    return JSON.parse(raw) as Run;
  } catch {
    return null;
  }
}

export async function listRuns(): Promise<Run[]> {
  await ensureDir();
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

/** Directory for generated files belonging to a run, served from /generated/<id>/ */
export async function runPublicDir(id: string) {
  const dir = path.join(process.cwd(), "public", "generated", id);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
