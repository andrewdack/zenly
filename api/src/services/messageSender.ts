export interface SendMessageInput {
  to: string;
  message: string;
  /** Optional E.164 sender/agent phone for multi-phone Photon projects. */
  fromPhone?: string;
}

export interface SendMessageResult {
  provider: string;
  platform: string;
  to: string;
  fromPhone?: string;
  messageId?: string;
  spaceId?: string;
}

export interface MessageSender {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
