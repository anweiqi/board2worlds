import { NextResponse } from "next/server";

const ALLOWED_HOST_SUFFIXES = [
  "worldlabs.ai",
  "googleapis.com",
  "googleusercontent.com",
  "pinimg.com",
  "vercel-storage.com",
];

/** Streams remote assets (SPZ splats, panos, thumbnails) so the browser viewer avoids CORS. */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (
    target.protocol !== "https:" ||
    !ALLOWED_HOST_SUFFIXES.some((s) => target.hostname === s || target.hostname.endsWith(`.${s}`))
  ) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const upstream = await fetch(target, { headers: { Accept: "*/*" } });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
  }
  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");
  // Do not forward Content-Length: fetch transparently decompresses gzip/br bodies,
  // so the upstream length would not match the bytes we stream.
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(upstream.body, { status: 200, headers });
}
