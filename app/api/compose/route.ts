import { NextResponse } from "next/server";
import { loadImage } from "@/lib/images";
import { composeScene } from "@/lib/openai";
import { loadRun, saveGeneratedImage, saveRun } from "@/lib/runs";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { run_id?: string; reference_indices?: number[] };
    if (!body.run_id) return NextResponse.json({ error: "run_id required" }, { status: 400 });
    const run = await loadRun(body.run_id);
    if (!run || !run.spec) {
      return NextResponse.json({ error: "run not found or not analyzed" }, { status: 404 });
    }

    const indices = (body.reference_indices?.length
      ? body.reference_indices
      : run.spec.reference_pin_indices
    ).filter((i) => i >= 0 && i < run.images.length);
    if (indices.length === 0) {
      return NextResponse.json({ error: "no reference images" }, { status: 400 });
    }
    if (indices.length > 6) indices.length = 6;

    const refs = await Promise.all(indices.map((i) => loadImage(run.images[i])));
    const png = await composeScene(refs, run.spec);

    const fileName = `scene-${Date.now()}.png`;
    const publicPath = await saveGeneratedImage(run.id, fileName, png, "image/png");

    run.mode = "fused";
    run.scene_image = publicPath;
    run.world_input_image = publicPath;
    run.status = "composed";
    run.spec.reference_pin_indices = indices;
    await saveRun(run);
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[compose]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
