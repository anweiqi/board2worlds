import { NextResponse } from "next/server";
import { loadImage } from "@/lib/images";
import { loadRun, saveRun } from "@/lib/runs";
import { generateWorld, uploadMediaAsset, WORLDLABS_MODEL } from "@/lib/worldlabs";

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      run_id?: string;
      input_image?: string;
      text_prompt?: string;
      model?: string;
    };
    if (!body.run_id) return NextResponse.json({ error: "run_id required" }, { status: 400 });
    const run = await loadRun(body.run_id);
    if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });

    const inputImage = body.input_image || run.world_input_image;
    if (!inputImage) {
      return NextResponse.json({ error: "no input image selected" }, { status: 400 });
    }
    const textPrompt = (body.text_prompt ?? run.world_text_prompt ?? "").trim();
    const model = body.model || WORLDLABS_MODEL;

    const img = await loadImage(inputImage);
    const mediaAssetId = await uploadMediaAsset(img, `board2worlds-${run.id}.${img.ext}`);
    const op = await generateWorld({
      displayName: run.spec?.world_title || `Board2Worlds ${run.id}`,
      mediaAssetId,
      textPrompt: textPrompt || undefined,
      model,
    });

    run.world_input_image = inputImage;
    run.world_text_prompt = textPrompt;
    run.status = "generating";
    run.worldlabs = {
      model,
      media_asset_id: mediaAssetId,
      operation_id: op.operation_id,
      progress: op.metadata?.progress?.description || "Submitted",
      world_id: op.metadata?.world_id,
    };
    await saveRun(run);
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
