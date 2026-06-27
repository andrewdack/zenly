export interface ApiConfig {
  port: number;
  openRouterApiKey?: string;
  openRouterBaseUrl: string;
  focusModel: string;
  maxImageBytes: number;
  photonProjectId?: string;
  photonProjectSecret?: string;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: readNumber(env.PORT, 3001),
    openRouterApiKey: env.OPENROUTER_API_KEY,
    openRouterBaseUrl: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    focusModel: env.FOCUS_MODEL || "google/gemma-3-12b-it",
    maxImageBytes: readNumber(env.MAX_IMAGE_BYTES, 5_000_000),
    photonProjectId: env.PROJECT_ID || env.PHOTON_PROJECT_ID,
    photonProjectSecret: env.PROJECT_SECRET || env.PHOTON_PROJECT_SECRET
  };
}
