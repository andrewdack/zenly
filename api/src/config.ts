export type MessageProvider = "photon" | "local";

export interface ApiConfig {
  port: number;
  // Vision (OpenRouter)
  openRouterApiKey?: string;
  openRouterBaseUrl: string;
  focusModel: string;
  maxImageBytes: number;
  // Agent chat (OpenRouter, same key)
  agentModel: string;
  snitchModel: string;
  // Messaging
  messageProvider: MessageProvider;
  photonProjectId?: string;
  photonProjectSecret?: string;
  // App
  deeplinkScheme: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const hasPhoton = Boolean(env.PHOTON_PROJECT_ID && env.PHOTON_PROJECT_SECRET);
  return {
    port: readNumber(env.PORT, 3001),
    openRouterApiKey: env.OPENROUTER_API_KEY,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    focusModel: env.FOCUS_MODEL || "google/gemma-3-12b-it",
    agentModel: env.AGENT_MODEL || "anthropic/claude-sonnet-4-6",
    snitchModel: env.SNITCH_MODEL || "anthropic/claude-haiku-4-5",
    maxImageBytes: readNumber(env.MAX_IMAGE_BYTES, 5_000_000),
    messageProvider: (env.MESSAGE_PROVIDER as MessageProvider) || (hasPhoton ? "photon" : "local"),
    photonProjectId: env.PHOTON_PROJECT_ID,
    photonProjectSecret: env.PHOTON_PROJECT_SECRET,
    deeplinkScheme: env.DEEPLINK_SCHEME || "zenly",
  };
}
