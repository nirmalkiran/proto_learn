/**
 * Constant: AGENT_URL
 * Purpose: Shared local helper base URL for mobile automation agent APIs.
 * Important: Keep fallback aligned with existing runtime behavior.
 */
const env = import.meta.env as Record<string, string | undefined>;
export const AGENT_URL = env.VITE_AGENT_URL || "http://localhost:3001";

/**
 * Constant: AGENT_TIMEOUT_MS
 * Purpose: Standard request timeout defaults for lightweight status checks.
 * Important: Consumers can override per request when existing behavior requires it.
 */
export const AGENT_TIMEOUT_MS = 5000;
