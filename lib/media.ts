// Pure helpers for /upload and /wall. No imports, so `npm test` runs them with plain node.

export type Media = {
  id: string;
  path: string;
  type: "image" | "video";
  author: string | null;
  created_at: string;
};

// Preferred extension first: it wins in the reverse lookup below.
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
};
const EXT_BY_MIME: Record<string, string> = {};
for (const [ext, mime] of Object.entries(MIME_BY_EXT)) EXT_BY_MIME[mime] ??= ext;

/** Storage extension, content type and media kind (null = not a photo/video). Some Androids give an empty file.type. */
export function describeFile(name: string, type: string) {
  const fromName = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const contentType = type || MIME_BY_EXT[fromName] || "";
  const kind = contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : null;
  const ext = /^[a-z0-9]{1,5}$/.test(fromName)
    ? fromName
    : EXT_BY_MIME[contentType] ?? (kind === "video" ? "mp4" : "jpg");
  return { ext, contentType, kind } as const;
}

/** Slideshow state: everything visible (upload order), unseen arrivals, position in the cycle. */
export type Deck = { items: Media[]; fresh: string[]; cursor: number };

export const newDeck = (): Deck => ({ items: [], fresh: [], cursor: 0 });

/** Next slide: unseen arrivals first (oldest first), then cycle through everything. Mutates deck. */
export function pickNext(deck: Deck): { item: Media; isNew: boolean } | null {
  while (deck.fresh.length) {
    const id = deck.fresh.shift();
    const item = deck.items.find((m) => m.id === id);
    if (item) return { item, isNew: true }; // else: hidden before it was shown
  }
  if (!deck.items.length) return null;
  const i = deck.cursor % deck.items.length;
  deck.cursor = i + 1;
  return { item: deck.items[i], isNew: false };
}

export const peekNext = (deck: Deck) => pickNext({ ...deck, fresh: [...deck.fresh] });

/** Replace the visible set with `rows` (drops media hidden by the admin). Returns how many rows are new. */
export function syncDeck(deck: Deck, rows: Media[], markFresh: boolean) {
  const known = new Set(deck.items.map((m) => m.id));
  const added = rows.filter((r) => !known.has(r.id));
  deck.items = rows;
  if (markFresh) deck.fresh.push(...added.map((r) => r.id));
  return added.length;
}
