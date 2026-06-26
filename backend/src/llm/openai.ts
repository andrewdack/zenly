import OpenAI from 'openai';
import config from '../config';
import type { ChatOptions, VisionOptions, LLMProvider } from '../types';

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

async function chat({ system, messages, maxTokens = 1024 }: ChatOptions): Promise<string> {
  const full: OpenAI.ChatCompletionMessageParam[] = system
    ? [{ role: 'system', content: system }, ...messages]
    : [...messages];
  const res = await getClient().chat.completions.create({
    model: config.openai.model,
    max_tokens: maxTokens,
    messages: full,
  });
  return res.choices[0]?.message?.content ?? '';
}

async function vision({
  system,
  prompt,
  imageBase64,
  mediaType = 'image/jpeg',
  maxTokens = 512,
}: VisionOptions): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
    ],
  });
  const res = await getClient().chat.completions.create({
    model: config.openai.model,
    max_tokens: maxTokens,
    messages,
  });
  return res.choices[0]?.message?.content ?? '';
}

const openaiProvider: LLMProvider = { name: 'openai', chat, vision };
export default openaiProvider;
