import { NextResponse } from "next/server";
import { loadImage } from "@/lib/images";
import { analyzeBoard } from "@/lib/openai";
import { newRunId, saveRun } from "@/lib/runs";
import type { Mode, Run } from "@/lib/types";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { images?: string[]; mode?: Mode };
    const images = (body.images || []).filter(Boolean);
    const mode: Mode = body.mode === "fused" ? "fused" : "hero";
    if (images.length < 1) {
      return NextResponse.json({ error: "Provide at least one image" }, { status: 400 });
    }
    if (images.length > 30) {
      return NextResponse.json({ error: "Max 30 images per board" }, { status: 400 });
    }

    const loaded = await Promise.all(images.map((src) => loadImage(src)));
    const spec = await analyzeBoard(loaded);

    const now = new Date().toISOString();
    const run: Run = {
      id: newRunId(),
      created_at: now,
      updated_at: now,
      mode,
      status: "analyzed",
      images,
      spec,
      world_text_prompt: spec.world_text_prompt,
    };
    if (mode === "hero") {
      run.world_input_image = images[spec.hero_pin_index];
    }
    await saveRun(run);
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[analyze]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
