# Board2Worlds

Demo: a list of Pinterest pin images → VLM board understanding → one explorable 3D world via the
[World Labs World API (Marble)](https://docs.worldlabs.ai/api), viewed in-browser with
three.js + [Spark](https://sparkjs.dev).

## Setup

```bash
npm install
```

Fill in `.env.local`:

```
WORLDLABS_API_KEY=   # https://platform.worldlabs.ai  (API keys page; needs credits)
OPENAI_API_KEY=      # optional if already exported in your shell
```

```bash
npm run dev   # http://localhost:3000
```

## Deploy (Vercel)

Serverless cannot keep `data/runs/` on disk. Production uses [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) when `BLOB_READ_WRITE_TOKEN` is present. Set these env vars in the Vercel project:

```
OPENAI_API_KEY
WORLDLABS_API_KEY   # or WORLD_LABS_API_KEY
SITE_PASSWORD       # optional gate so random visitors cannot spend your credits
BLOB_READ_WRITE_TOKEN
```

Hobby plans cap serverless functions at ~60–300s depending on the account. Analyze is ~1 min; fused compose is ~2 min and may time out on the lowest plan. Hero-pin generation only needs ~10s to submit, then the client polls.

## Flow

1. **Board images** – paste one image URL per line, or click *Load example board* (the 14 pins in
   `public/board/`).
2. **Analyze** – `POST /api/analyze` sends all pins to the OpenAI vision model with a structured
   output schema and returns a `SceneSpec`: per-pin role (`scene | landmark | detail | material |
   mood | ignore`) and scene score, world title/style/layout/zones, materials, palette, key objects,
   a hero pin, 3–5 reference pins, a Marble text prompt and an image-composer prompt.
3. Pick a mode:
   - **Hero pin → world** – the best wide scene pin (click to override) + the prompt are sent to
     Marble directly.
   - **Fused scene → world** – `POST /api/compose` asks `gpt-image` to paint one eye-level wide
     scene from the selected reference pins; you approve it, then it is sent to Marble.
4. **Generate** – `POST /api/generate` uploads the image as a World Labs media asset and calls
   `worlds:generate`. The UI polls `GET /api/runs/:id` (which polls `operations/:id`) until done
   (~5 min). Each world consumes World Labs credits.
5. **World** – Marble share link, SPZ download, and an in-page Spark viewer (drag to look, WASD to
   move). SPZ/thumbnails are streamed through `/api/proxy` to avoid CORS.

Runs are stored as JSON in `data/runs/`; composed scene images in `public/generated/<run>/`.

## Notes

- Models: `OPENAI_VISION_MODEL` (default `gpt-5.4`), `OPENAI_IMAGE_MODEL` (default `gpt-image-2`),
  `WORLDLABS_MODEL` (default `marble-1.1`; choose `marble-1.1-plus` in the UI for larger outdoor
  worlds).
- Pinterest CDN URLs are downloaded server-side and uploaded as media assets rather than passed as
  `source: "uri"`, since World Labs servers may be hotlink-blocked.
- Marble SPZ files use the `marble_raw_opencv` frame; the viewer applies the documented 180° X
  rotation plus `metric_scale_factor` / `ground_plane_offset`.
