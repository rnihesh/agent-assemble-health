import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";

/**
 * Per-request HTTP header storage scoped via Node's AsyncLocalStorage so MCP
 * tool callbacks can resolve canonical SHARP headers from the inbound HTTP
 * request without changing the MCP SDK's tool callback signature.
 *
 * The Express handler for `/mcp` wraps the MCP transport call inside
 * `runWithRequestHeaders`, and downstream tool callbacks read the active
 * headers via `getCurrentRequestHeaders()`.
 */
const headerStore = new AsyncLocalStorage<IncomingHttpHeaders>();

export function runWithRequestHeaders<T>(
  headers: IncomingHttpHeaders,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return headerStore.run(headers, fn);
}

export function getCurrentRequestHeaders(): IncomingHttpHeaders | undefined {
  return headerStore.getStore();
}
