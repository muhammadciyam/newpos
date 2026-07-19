import { safeServerCall } from "@/lib/server-fn-helpers";
import { searchProductImageOnServer } from "@/lib/image-search-api";

// Best-effort automatic photo lookup for a product name — used wherever a product is
// created without a manually-uploaded image. Never throws and never blocks product
// creation: an unconfigured API key, no results, or a network error all just resolve to
// "", leaving the product to fall back to the placeholder image like before.
export async function findProductPhoto(query: string): Promise<string> {
  const result = await safeServerCall(() => searchProductImageOnServer({ data: { query } }));
  if ("networkError" in result || "error" in result) return "";
  return result.imageUrl;
}
