"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXAMPLE_BOARD } from "@/lib/example-board";
import type { Mode, PinRole, Run } from "@/lib/types";

const SplatViewer = dynamic(() => import("./SplatViewer"), { ssr: false });

const ROLE_STYLES: Record<PinRole, string> = {
  scene: "bg-emerald-500/90 text-white",
  landmark: "bg-sky-500/90 text-white",
  detail: "bg-amber-500/90 text-black",
  material: "bg-fuchsia-500/90 text-white",
  mood: "bg-indigo-500/90 text-white",
  ignore: "bg-zinc-600/90 text-white",
};

type Busy = null | "analyze" | "compose" | "generate";

function parseList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s) || s.startsWith("/"));
}

export default function Board2Worlds({ initialRunId }: { initialRunId?: string }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("hero");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [refIndices, setRefIndices] = useState<number[]>([]);
  const [wlModel, setWlModel] = useState("marble-1.1");
  const [history, setHistory] = useState<
    { id: string; title?: string; status: string; mode: string; thumbnail?: string }[]
  >([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const images = useMemo(() => parseList(text), [text]);

  const refreshHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      const data = await res.json();
      setHistory(data.runs || []);
    } catch {
      // ignore
    }
  }, []);

  const adoptRun = useCallback((r: Run) => {
    setRun(r);
    setMode(r.mode);
    setText(r.images.join("\n"));
    setPrompt(r.world_text_prompt || r.spec?.world_text_prompt || "");
    setInputImage(r.world_input_image || null);
    setRefIndices(r.spec?.reference_pin_indices || []);
    if (r.worldlabs?.model) setWlModel(r.worldlabs.model);
  }, []);

  const loadRun = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/runs/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.run) adoptRun(data.run);
    },
    [adoptRun],
  );

  useEffect(() => {
    void (async () => {
      await refreshHistory();
      if (initialRunId) await loadRun(initialRunId);
    })();
  }, [initialRunId, loadRun, refreshHistory]);

  // Poll while generating
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (run?.status === "generating") {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/runs/${run.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.run) {
          setRun(data.run);
          if (data.run.status !== "generating") refreshHistory();
        }
      }, 8000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [run?.id, run?.status, refreshHistory]);

  async function call<T>(url: string, body: unknown, method = "POST"): Promise<T> {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `${res.status}`);
    return data as T;
  }

  async function onAnalyze() {
    setError(null);
    setBusy("analyze");
    try {
      const data = await call<{ run: Run }>("/api/analyze", { images, mode });
      adoptRun(data.run);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onCompose() {
    if (!run) return;
    setError(null);
    setBusy("compose");
    try {
      const data = await call<{ run: Run }>("/api/compose", {
        run_id: run.id,
        reference_indices: refIndices,
      });
      adoptRun(data.run);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onGenerate() {
    if (!run || !inputImage) return;
    setError(null);
    setBusy("generate");
    try {
      const data = await call<{ run: Run }>("/api/generate", {
        run_id: run.id,
        input_image: inputImage,
        text_prompt: prompt,
        model: wlModel,
      });
      adoptRun(data.run);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function toggleRef(i: number) {
    setRefIndices((cur) =>
      cur.includes(i) ? cur.filter((x) => x !== i) : cur.length >= 6 ? cur : [...cur, i],
    );
  }

  const world = run?.worldlabs?.world;
  const spz =
    world?.assets?.splats?.spz_urls?.["500k"] ||
    world?.assets?.splats?.spz_urls?.["100k"] ||
    world?.assets?.splats?.spz_urls?.["full_res"];
  const sem = world?.assets?.splats?.semantics_metadata;

  const canGenerate =
    !!run && !!inputImage && (mode === "hero" || (mode === "fused" && !!run.scene_image));

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-6 py-8">
      {/* Sidebar: history */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Runs</h2>
        <ul className="space-y-1">
          {history.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => loadRun(h.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-zinc-800 ${
                  run?.id === h.id ? "bg-zinc-800" : ""
                }`}
              >
                {h.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={h.thumbnail} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span className="h-8 w-8 rounded bg-zinc-700" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{h.title || h.id}</span>
                  <span className="block text-[10px] text-zinc-500">
                    {h.mode} · {h.status}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {history.length === 0 && <li className="text-xs text-zinc-500">No runs yet</li>}
        </ul>
      </aside>

      <main className="min-w-0 flex-1 space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Board2Worlds</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Pinterest board images → scene understanding → one explorable 3D world (World Labs
            Marble).
          </p>
        </header>

        {/* Step 1: input */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">1. Board images</h2>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                onClick={() => setText(EXAMPLE_BOARD.join("\n"))}
              >
                Load example board (14 pins)
              </button>
              <button
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800"
                onClick={() => {
                  setText("");
                  setRun(null);
                  setInputImage(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"One image URL per line\nhttps://i.pinimg.com/originals/...jpg"}
            className="h-28 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs outline-none focus:border-zinc-500"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <div className="flex rounded-md border border-zinc-700 p-0.5 text-xs">
              {(["hero", "fused"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-1.5 ${
                    mode === m ? "bg-zinc-100 text-zinc-900" : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {m === "hero" ? "Hero pin → world" : "Fused scene → world"}
                </button>
              ))}
            </div>
            <span className="text-xs text-zinc-500">
              {mode === "hero"
                ? "Pick the best wide scene pin, write a prompt from the rest, send that pin to Marble."
                : "Compose one unified eye-level scene image from 3–5 pins, approve it, then send to Marble."}
            </span>
            <button
              disabled={images.length === 0 || busy !== null}
              onClick={onAnalyze}
              className="ml-auto rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "analyze" ? "Analyzing…" : `Analyze ${images.length} pins`}
            </button>
          </div>
          {images.length > 0 && !run && (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src + i}
                  src={src}
                  alt=""
                  className="aspect-[3/4] w-full rounded-md object-cover"
                />
              ))}
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-md border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Step 2: analysis */}
        {run?.spec && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-medium">2. Board understanding</h2>
              <span className="text-xs text-zinc-500">run {run.id}</span>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {run.images.map((src, i) => {
                    const pin = run.spec!.pins.find((p) => p.index === i);
                    const isHero = i === run.spec!.hero_pin_index;
                    const selectedAsInput = mode === "hero" && inputImage === src;
                    const isRef = refIndices.includes(i);
                    return (
                      <button
                        key={src + i}
                        onClick={() => {
                          if (mode === "hero") setInputImage(src);
                          else toggleRef(i);
                        }}
                        title={pin?.summary}
                        className={`group relative overflow-hidden rounded-md border-2 text-left ${
                          selectedAsInput || (mode === "fused" && isRef)
                            ? "border-emerald-400"
                            : "border-transparent"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="aspect-[3/4] w-full object-cover" />
                        <div className="absolute left-1 top-1 flex gap-1">
                          {pin && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_STYLES[pin.role]}`}
                            >
                              {pin.role} {pin.scene_score}
                            </span>
                          )}
                          {isHero && (
                            <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-black">
                              hero
                            </span>
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/80 p-1.5 text-[10px] leading-tight text-zinc-200 transition group-hover:translate-y-0">
                          {pin?.summary}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {mode === "hero"
                    ? "Click a pin to use it as the world input (hero is preselected)."
                    : `Click pins to toggle references for the composer (${refIndices.length}/6, hero first).`}
                </p>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-lg font-medium">{run.spec.world_title}</div>
                  <div className="text-zinc-400">{run.spec.world_type}</div>
                </div>
                <Field label="Style">{run.spec.style}</Field>
                <Field label="Layout">{run.spec.layout}</Field>
                <Field label="Zones">
                  <ul className="list-inside list-disc space-y-0.5">
                    {run.spec.zones.map((z) => (
                      <li key={z.name}>
                        <span className="text-zinc-200">{z.name}:</span> {z.description}
                      </li>
                    ))}
                  </ul>
                </Field>
                <Field label="Materials">{run.spec.materials.join(", ")}</Field>
                <Field label="Palette">
                  <span className="flex flex-wrap gap-1">
                    {run.spec.palette.map((c) => (
                      <span key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">
                        {c}
                      </span>
                    ))}
                  </span>
                </Field>
                <Field label="Key objects">{run.spec.key_objects.join(", ")}</Field>
                <Field label="Avoid">{run.spec.avoid.join(", ")}</Field>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: scene image (fused) */}
        {run?.spec && mode === "fused" && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium">3. Fused scene image</h2>
              <button
                disabled={busy !== null || refIndices.length === 0}
                onClick={onCompose}
                className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-40"
              >
                {busy === "compose"
                  ? "Composing (30–90s)…"
                  : run.scene_image
                    ? "Re-compose"
                    : "Compose scene image"}
              </button>
            </div>
            <details className="mb-3 text-xs text-zinc-400">
              <summary className="cursor-pointer">Composer prompt</summary>
              <p className="mt-2 whitespace-pre-wrap">{run.spec.compose_prompt}</p>
            </details>
            {run.scene_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={run.scene_image}
                alt="Fused scene"
                className="w-full rounded-lg border border-zinc-800"
              />
            ) : (
              <div className="flex aspect-[3/2] items-center justify-center rounded-lg border border-dashed border-zinc-700 text-sm text-zinc-500">
                No scene image yet
              </div>
            )}
          </section>
        )}

        {/* Step 4: generate */}
        {run?.spec && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="mb-3 font-medium">{mode === "fused" ? "4" : "3"}. Generate world</h2>
            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              <div>
                <div className="mb-1 text-xs text-zinc-500">World input image</div>
                {inputImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={inputImage}
                    alt=""
                    className="w-full rounded-md border border-zinc-800 object-cover"
                  />
                ) : (
                  <div className="aspect-[3/4] rounded-md border border-dashed border-zinc-700" />
                )}
              </div>
              <div className="space-y-3">
                <label className="block text-xs text-zinc-500">
                  Text prompt for Marble (editable)
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="mt-1 h-28 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-zinc-500">
                    Model{" "}
                    <select
                      value={wlModel}
                      onChange={(e) => setWlModel(e.target.value)}
                      className="ml-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                    >
                      <option value="marble-1.1">marble-1.1</option>
                      <option value="marble-1.1-plus">marble-1.1-plus (larger outdoor)</option>
                    </select>
                  </label>
                  <button
                    disabled={!canGenerate || busy !== null || run.status === "generating"}
                    onClick={onGenerate}
                    className="ml-auto rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === "generate"
                      ? "Submitting…"
                      : run.status === "generating"
                        ? "Generating…"
                        : "Generate world (uses credits, ~5 min)"}
                  </button>
                </div>
                {run.worldlabs && (
                  <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      {run.status === "generating" && (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                      )}
                      <span className="text-zinc-300">
                        {run.status} · {run.worldlabs.progress}
                      </span>
                    </div>
                    {run.worldlabs.error && (
                      <div className="mt-1 text-red-300">{run.worldlabs.error}</div>
                    )}
                    <div className="mt-1 text-zinc-500">
                      op {run.worldlabs.operation_id}
                      {run.worldlabs.world_id && ` · world ${run.worldlabs.world_id}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Result */}
        {run?.status === "succeeded" && world && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">World</h2>
              <div className="flex gap-2 text-xs">
                {world.world_marble_url && (
                  <a
                    href={world.world_marble_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-zinc-100 px-3 py-1.5 font-medium text-zinc-900"
                  >
                    Open in Marble ↗
                  </a>
                )}
                {spz && (
                  <a
                    href={spz}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                  >
                    Download SPZ
                  </a>
                )}
                {world.assets?.imagery?.pano_url && (
                  <a
                    href={world.assets.imagery.pano_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"
                  >
                    Pano
                  </a>
                )}
              </div>
            </div>
            {spz ? (
              <SplatViewer
                spzUrl={spz}
                metricScaleFactor={sem?.metric_scale_factor}
                groundPlaneOffset={sem?.ground_plane_offset}
                className="aspect-video w-full overflow-hidden rounded-lg border border-zinc-800"
              />
            ) : (
              <div className="text-sm text-zinc-400">No splat URL in response.</div>
            )}
            {world.assets?.caption && (
              <p className="mt-3 text-xs text-zinc-400">{world.assets.caption}</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-zinc-300">{children}</div>
    </div>
  );
}
