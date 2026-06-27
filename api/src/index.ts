import "dotenv/config";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

const projectId = process.env.PROJECT_ID ?? process.env.PHOTON_PROJECT_ID;
const projectSecret = process.env.PROJECT_SECRET ?? process.env.PHOTON_PROJECT_SECRET;

if (!projectId || !projectSecret) {
  throw new Error("PROJECT_ID and PROJECT_SECRET are required");
}

const app = await Spectrum({
  projectId,
  projectSecret,
  providers: [imessage.config()]
});

for await (const [space, message] of app.messages) {
  if (message.content.type === "text") {
    await space.send(message.content.text);
  }
}
