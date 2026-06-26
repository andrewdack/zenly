import Anthropic from '@anthropic-ai/sdk';
import config from '../config';
import type { ChatOptions, VisionOptions, LLMProvider } from '../types';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

function textFrom(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

async function chat({ system, messages, maxTokens = 1024 }: ChatOptions): Promise<string> {
  const res = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages,
  });
  return textFrom(res);
}

async function vision({
  system,
  prompt,
  imageBase64,
  mediaType = 'image/jpeg',
  maxTokens = 512,
}: VisionOptions): Promise<string> {
  const res = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as Anthropic.Base64ImageSource['media_type'],
              data: imageBase64,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  return textFrom(res);
}

const anthropicProvider: LLMProvider = { name: 'anthropic', chat, vision };
export default anthropicProvider;
