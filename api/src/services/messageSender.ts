export interface SendMessageInput {
  to: string;
  message: string;
}

export interface SendMessageResult {
  provider: "photon";
  platform: "imessage";
  to: string;
  messageId?: string;
  spaceId?: string;
}

export interface MessageSender {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
