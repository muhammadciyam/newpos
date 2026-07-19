import { createServerFn } from "@tanstack/react-start";

// Server-only. Looks up a product photo via the Google Custom Search JSON API (image
// search) and returns it as a data URI — the same format the manual "upload a photo"
// flows already produce via FileReader.readAsDataURL, so both paths store images
// identically and nothing downstream needs to know the difference.
//
// Requires GOOGLE_CSE_API_KEY + GOOGLE_CSE_ID in .env (see .env.example). To bias
// results toward Maldivian retailers, restrict the Programmable Search Engine to
// specific sites under "Sites to search" in the Google control panel — that's
// configured on Google's side, not here.

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function fetchAsDataUri(imageUrl: string): Promise<string | null> {
  const res = await fetch(imageUrl);
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;
  const contentLength = Number(res.headers.get("content-length") ?? "0");
  if (contentLength > MAX_IMAGE_BYTES) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) return null;
  return `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
}

export const searchProductImageOnServer = createServerFn({ method: "POST" })
  .validator((data: { query: string }) => data)
  .handler(async ({ data }) => {
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    if (!apiKey || !cseId) {
      return { error: "Image search is not configured (GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID)" };
    }
    const query = data.query.trim();
    if (!query) return { error: "No search query" };

    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("cx", cseId);
    url.searchParams.set("q", query);
    url.searchParams.set("searchType", "image");
    url.searchParams.set("num", "3");
    url.searchParams.set("safe", "active");

    let items: Array<{ link?: string }>;
    try {
      const res = await fetch(url);
      if (!res.ok) return { error: `Image search failed (${res.status})` };
      const json = (await res.json()) as { items?: Array<{ link?: string }> };
      items = json.items ?? [];
    } catch {
      return { error: "Image search request failed" };
    }

    for (const item of items) {
      if (!item.link) continue;
      try {
        const dataUri = await fetchAsDataUri(item.link);
        if (dataUri) return { ok: true as const, imageUrl: dataUri };
      } catch {
        // Try the next candidate — a single unreachable/oversized image shouldn't fail the search.
      }
    }
    return { error: "No usable image found" };
  });
