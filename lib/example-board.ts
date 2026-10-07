/** The user's hand-pulled Pinterest board, served from /public/board. */
export const EXAMPLE_BOARD: string[] = Array.from(
  { length: 14 },
  (_, i) => `/board/pin-${String(i + 1).padStart(2, "0")}.jpg`,
);
