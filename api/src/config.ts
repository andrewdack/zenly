export interface ApiConfig {
  port: number;
  openAiApiKey?: string;
  openAiFocusModel: string;
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
    openAiApiKey: env.OPENAI_API_KEY,
    openAiFocusModel: env.OPENAI_FOCUS_MODEL || "gpt-4o-mini",
    maxImageBytes: readNumber(env.MAX_IMAGE_BYTES, 5_000_000),
    photonProjectId: env.PHOTON_PROJECT_ID,
    photonProjectSecret: env.PHOTON_PROJECT_SECRET
  };
}
