// Best-effort automatic product image lookup.
//
// There's no backend and no configured image-search API key (Google/Bing Custom
// Search, Unsplash, etc. all require credentials this project doesn't have), so
// this uses Wikipedia/Wikimedia's free, keyless, CORS-enabled public API as a
// stand-in "search the internet" step: it fuzzy-matches the query to the closest
// article via opensearch, then reads that article's lead image. Many product
// names (especially packaged-goods names with sizes/SKUs) won't resolve to
// anything meaningful — that's expected and handled by the caller falling back
// to the placeholder image.
const TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findWikipediaTitle(query: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url);
  if (!res) return null;
  try {
    const data = (await res.json()) as [string, string[], string[], string[]];
    return data?.[1]?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchThumbnail(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetchWithTimeout(url);
  if (!res) return null;
  try {
    const data = (await res.json()) as { thumbnail?: { source?: string } };
    return data?.thumbnail?.source ?? null;
  } catch {
    return null;
  }
}

/**
 * Tries to find a product photo online using the product name, then the
 * barcode, then both combined. Returns null if nothing usable was found
 * (caller should fall back to the placeholder image).
 */
export async function findProductImage(name: string, barcode?: string): Promise<string | null> {
  const queries = [name, barcode ? `${name} ${barcode}` : null, barcode ?? null].filter(
    (q): q is string => !!q?.trim(),
  );

  for (const query of queries) {
    const title = await findWikipediaTitle(query);
    if (!title) continue;
    const thumbnail = await fetchThumbnail(title);
    if (thumbnail) return thumbnail;
  }
  return null;
}
