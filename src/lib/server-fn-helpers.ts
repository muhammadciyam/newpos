// Wraps a call to a createServerFn function so a network/server failure (dev server
// restarting, connection drop, etc.) always resolves to a normal `{error}` result
// instead of throwing — callers' existing `if ("error" in result)` handling then takes
// care of surfacing it and resetting any pending/loading state, instead of the action
// hanging forever with nothing saved and no feedback.
export async function safeServerCall<T extends { error?: string }>(
  fn: () => Promise<T>,
  fallbackMessage = "Couldn't reach the server — check your connection and try again.",
): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch {
    return { error: fallbackMessage };
  }
}
