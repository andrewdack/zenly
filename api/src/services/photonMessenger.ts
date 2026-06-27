import { Spectrum, text } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type { MessageSender, SendMessageInput, SendMessageResult } from "./messageSender.js";

export interface PhotonMessengerOptions {
  projectId?: string;
  projectSecret?: string;
}

export class PhotonMessenger implements MessageSender {
  private readonly projectId: string;
  private readonly projectSecret: string;
  private imessageApiPromise?: Promise<any>;

  constructor(options: PhotonMessengerOptions) {
    if (!options.projectId || !options.projectSecret) {
      throw new Error("PHOTON_PROJECT_ID and PHOTON_PROJECT_SECRET are required for Photon messaging");
    }

    this.projectId = options.projectId;
    this.projectSecret = options.projectSecret;
  }

  private async getImessageApi(): Promise<any> {
    this.imessageApiPromise ??= Spectrum({
      projectId: this.projectId,
      projectSecret: this.projectSecret,
      providers: [imessage.config()]
    }).then((app) => imessage(app));

    return this.imessageApiPromise;
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const imessageApi = await this.getImessageApi();

    // Spectrum hands us a composite space id like "any;-;+15715197392" as the
    // user's "phone". space.create() needs a bare E.164 number, so extract it.
    const to = toE164(input.to);

    // Phone-number based: resolve/create a 1:1 conversation for this one-off message.
    // We intentionally do not accept arrays/group participant lists in the HTTP API.
    const space = await imessageApi.space.create(to);
    const sent = await space.send(text(input.message));

    return {
      provider: "photon",
      platform: "imessage",
      to,
      messageId: sent?.id,
      spaceId: space.id
    };
  }
}

/** Pull a bare E.164 number out of a raw target (handles Spectrum's "any;-;+1555…" ids). */
function toE164(raw: string): string {
  const match = raw.match(/\+\d{7,15}/);
  return match ? match[0] : raw;
}
