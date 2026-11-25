// frontend/src/links.ts
// Shareable game links: https://chess.azimondia.com/?id=k7m2qx opens that game's review.

/** The game reference in a query string ("?id=k7m2qx" or "?id=123"), or null if absent/invalid. */
export function parseGameRef(search: string): string | null {
  const ref = new URLSearchParams(search).get("id");
  return ref && /^[a-z0-9]{1,12}$/i.test(ref) ? ref : null;
}

export function gameRefFromUrl(): string | null {
  return parseGameRef(window.location.search);
}

export function gameLink(publicId: string): string {
  return `${window.location.origin}/?id=${publicId}`;
}

/** Put the game's link in the address bar (no new history entry). */
export function showGameLink(publicId: string): void {
  window.history.replaceState(null, "", `/?id=${publicId}`);
}

export function clearGameLink(): void {
  if (window.location.search) window.history.replaceState(null, "", "/");
}
