import "dotenv/config";
import OpenAI from "openai";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { OpenAiFocusProvider } from "./services/openAiFocusProvider.js";
import { PhotonMessenger } from "./services/photonMessenger.js";
import { ImessageKitMessenger } from "./services/imessageKitMessenger.js";
import { createAgentHandler } from "./agent/handler.js";

const config = getConfig();

const openai = new OpenAI({
  apiKey: config.openRouterApiKey ?? "not-configured",
  baseURL: config.openRouterBaseUrl,
});
if (!config.openRouterApiKey) {
  console.warn("  NOTE: OPENROUTER_API_KEY not set — /isFocused and agent will not work.");
}

// ── Messaging provider ────────────────────────────────────────────────────
let localMessenger: ImessageKitMessenger | null = null;

if (config.messageProvider === "local" || !config.photonProjectId) {
  try {
    localMessenger = new ImessageKitMessenger();
    console.log("  Messenger: local (imessage-kit)");
  } catch (err) {
    console.error("[imessage] local messenger unavailable:", (err as Error).message);
    console.error("  → Grant Full Disk Access to Terminal in System Settings > Privacy & Security.");
  }
}

const messageSender =
  config.messageProvider === "photon" && config.photonProjectId
    ? new PhotonMessenger({ projectId: config.photonProjectId, projectSecret: config.photonProjectSecret })
    : (localMessenger ?? {
        sendMessage: async (i) => {
          console.warn("[msg] no sender configured — would have sent:", i);
          return { provider: "none", platform: "none", to: i.to };
        }
      });

if (config.messageProvider === "photon" && config.photonProjectId) {
  console.log("  Messenger: cloud (photon)");
}

// ── Express app ───────────────────────────────────────────────────────────
const app = createApp({
  maxImageBytes: config.maxImageBytes,
  focusProvider: new OpenAiFocusProvider({
    apiKey: config.openRouterApiKey,
    model: config.focusModel,
    baseURL: config.openRouterBaseUrl,
    providerName: "openrouter",
  }),
  messageSender,
  openai,
  agentModel: config.agentModel,
  snitchModel: config.snitchModel,
  deeplinkScheme: config.deeplinkScheme,
});

app.listen(config.port, () => {
  console.log(`Zenly API on :${config.port}`);
  console.log(`  Vision model:  ${config.focusModel}`);
  console.log(`  Agent model:   ${config.agentModel}`);
  console.log(`  Deeplink:      ${config.deeplinkScheme}://`);
});

// ── iMessage watcher (local fallback — receives DMs and runs the agent) ───
if (localMessenger) {
  const handleMessage = createAgentHandler(openai, config.agentModel, config.deeplinkScheme);
  const sdk = localMessenger.sdk;

  sdk
    .startWatching({
      onIncomingMessage: (msg) => {
        console.log(`[watcher] from=${msg.participant} text=${msg.text?.slice(0, 60)}`);
      },
      onDirectMessage: async (msg) => {
        const { participant: from, text, chatId } = msg;
        if (!text || !from || !chatId) return;
        console.log(`[agent] <- ${from}: ${text.slice(0, 80)}`);
        const reply = await handleMessage(from, text.trim());
        console.log(`[agent] -> ${from}: ${reply.slice(0, 80)}`);
        await sdk.send({ to: chatId, text: reply });
      },
      onError: (err: unknown) => console.error("[imessage] watcher error:", err),
    })
    .then(() => console.log("  iMessage watcher active — listening for DMs."))
    .catch((err: unknown) => console.error("[imessage] watcher failed to start:", err));
}
