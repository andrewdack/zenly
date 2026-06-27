import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { MessageSender, SendMessageInput, SendMessageResult } from "./messageSender.js";

export class ImessageKitMessenger implements MessageSender {
  // Exposed so server.ts can attach the watcher to the same SDK instance.
  readonly sdk: IMessageSDK;

  constructor() {
    this.sdk = new IMessageSDK({ debug: true });
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    await this.sdk.send({ to: input.to, text: input.message });
    return { provider: "local", platform: "imessage", to: input.to };
  }
}
