import "dotenv/config";
import OpenAI from "openai";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { getConfig } from "./config.js";
import { createAgentHandler } from "./agent/handler.js";

const config = getConfig();

if (!config.photonProjectId || !config.photonProjectSecret) {
  console.error("PROJECT_ID and PROJECT_SECRET required for Photon mode. Run src/server.ts for local mode.");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: config.openRouterApiKey ?? "not-configured",
  baseURL: config.openRouterBaseUrl,
});

const handleMessage = createAgentHandler(openai, config.agentModel, config.deeplinkScheme);

const app = await Spectrum({
  projectId: config.photonProjectId,
  projectSecret: config.photonProjectSecret,
  providers: [imessage.config()],
});

console.log("Zenly agent running via Photon (Spectrum)");
console.log(`  Agent model: ${config.agentModel}`);

for await (const [space, message] of app.messages) {
  if (message.content.type !== "text") continue;
  const from = space.id;
  const text = message.content.text.trim();
  console.log(`[agent] <- ${from}: ${text.slice(0, 80)}`);
  const reply = await handleMessage(from, text);
  console.log(`[agent] -> ${from}: ${reply.slice(0, 80)}`);
  await space.send(reply);
}
