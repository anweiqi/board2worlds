const COOKIE = "b2w_access";

export function gateCookieName() {
  return COOKIE;
}

export async function gateToken(password: string) {
  const data = new TextEncoder().encode(`board2worlds:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
