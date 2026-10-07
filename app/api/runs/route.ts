import { NextResponse } from "next/server";
import { listRuns } from "@/lib/runs";

export async function GET() {
  const runs = await listRuns();
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      mode: r.mode,
      status: r.status,
      title: r.spec?.world_title,
      thumbnail: r.worldlabs?.world?.assets?.thumbnail_url || r.scene_image || r.world_input_image,
      marble_url: r.worldlabs?.world?.world_marble_url,
    })),
  });
}
