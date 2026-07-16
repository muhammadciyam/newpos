// A network/transport failure calling a server function — tagged with a unique
// `networkError` marker (rather than a bare `{error: string}`) so it never collides
// with a server function's own `{error: "..."}` business-logic shape and defeats
// TypeScript's narrowing. Always check `"networkError" in result` first.
export type ServerCallFailure = { networkError: true; error: string };

// Wraps a call to a createServerFn function so a network/server failure (dev server
// restarting, connection drop, etc.) always resolves to a normal result instead of
// throwing — callers' existing error handling then takes care of surfacing it and
// resetting any pending/loading state, instead of the action hanging forever with
// nothing saved and no feedback.
export async function safeServerCall<T>(
  fn: () => Promise<T>,
  fallbackMessage = "Couldn't reach the server — check your connection and try again.",
): Promise<T | ServerCallFailure> {
  try {
    return await fn();
  } catch (err) {
    console.error("safeServerCall failed:", err);
    return { networkError: true, error: fallbackMessage };
  }
}
