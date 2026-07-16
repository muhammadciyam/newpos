import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only. Uses the service_role key, which bypasses Row Level Security — this must
// never be imported from a client component or any file that ends up in the browser
// bundle. Only *-server-store.ts files (the createServerFn boundary's storage layer)
// should import this.

let client: SupabaseClient | null = null;

// Node's fetch (undici) occasionally throws a transient "fetch failed" / TLS handshake
// error (e.g. "unsuitable certificate purpose") on the first request of a fresh
// connection — retrying immediately with a new connection succeeds. Only retries when
// fetch() itself throws (a network/TLS-level failure), never on an actual HTTP response
// (4xx/5xx), which is returned normally and handled by the caller as before.
async function retryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
  throw new Error("unreachable");
}

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env " +
        "(see .env.example), then restart the dev server.",
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    global: { fetch: retryFetch },
  });
  return client;
}
