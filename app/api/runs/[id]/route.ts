import { NextResponse } from "next/server";
import { loadRun, saveRun } from "@/lib/runs";
import { getOperation, getWorld } from "@/lib/worldlabs";

type Ctx = { params: Promise<{ id: string }> };

/** GET a run; if a World Labs operation is in flight, poll it and persist progress. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const run = await loadRun(id);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });

  if (run.status === "generating" && run.worldlabs?.operation_id) {
    try {
      const op = await getOperation(run.worldlabs.operation_id);
      run.worldlabs.progress =
        op.metadata?.progress?.description || op.metadata?.progress?.status || run.worldlabs.progress;
      if (op.metadata?.world_id) run.worldlabs.world_id = op.metadata.world_id;
      if (op.done) {
        if (op.error) {
          run.status = "failed";
          run.worldlabs.error = op.error.message || JSON.stringify(op.error);
        } else {
          run.status = "succeeded";
          let world = op.response ?? undefined;
          const worldId = world?.id || run.worldlabs.world_id;
          if (worldId) {
            try {
              world = await getWorld(worldId);
            } catch {
              // snapshot from the operation is good enough
            }
          }
          run.worldlabs.world = world;
          run.worldlabs.world_id = world?.id || run.worldlabs.world_id;
        }
      }
      await saveRun(run);
    } catch (err) {
      run.worldlabs.progress = `Poll error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return NextResponse.json({ run });
}

/** PATCH editable fields (prompt / selected input image / mode). */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const run = await loadRun(id);
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  const body = (await req.json()) as Partial<{
    world_text_prompt: string;
    world_input_image: string;
    mode: "hero" | "fused";
  }>;
  if (typeof body.world_text_prompt === "string") run.world_text_prompt = body.world_text_prompt;
  if (typeof body.world_input_image === "string") run.world_input_image = body.world_input_image;
  if (body.mode === "hero" || body.mode === "fused") run.mode = body.mode;
  await saveRun(run);
  return NextResponse.json({ run });
}
