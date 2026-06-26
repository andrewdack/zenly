export interface SendMessageInput {
  to: string;
  message: string;
}

export interface SendMessageResult {
  provider: string;
  platform: string;
  to: string;
  messageId?: string;
}

export interface MessageSender {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
}
