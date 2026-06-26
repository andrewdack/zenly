import "dotenv/config";
import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { OpenAiFocusProvider } from "./services/openAiFocusProvider.js";
import { PhotonMessenger } from "./services/photonMessenger.js";

const config = getConfig();

const app = createApp({
  maxImageBytes: config.maxImageBytes,
  focusProvider: new OpenAiFocusProvider({
    apiKey: config.openRouterApiKey,
    model: config.focusModel,
    baseURL: config.openRouterBaseUrl,
    providerName: "openrouter"
  }),
  messageSender: new PhotonMessenger({
    projectId: config.photonProjectId,
    projectSecret: config.photonProjectSecret
  })
});

app.listen(config.port, () => {
  console.log(`Zenly API listening on http://localhost:${config.port}`);
});
