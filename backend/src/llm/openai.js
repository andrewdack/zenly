'use strict';

const OpenAI = require('openai');
const config = require('../config');

let client = null;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: config.openai.apiKey });
  return client;
}

/**
 * Multi-turn text chat. Same signature as the Anthropic provider.
 * @param {{system?: string, messages: {role:'user'|'assistant', content:string}[], maxTokens?: number}} opts
 * @returns {Promise<string>}
 */
async function chat({ system, messages, maxTokens = 1024 }) {
  const full = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const res = await getClient().chat.completions.create({
    model: config.openai.model,
    max_tokens: maxTokens,
    messages: full,
  });
  return res.choices[0]?.message?.content || '';
}

/**
 * Single-image vision call. Same signature as the Anthropic provider.
 * @param {{system?: string, prompt: string, imageBase64: string, mediaType?: string, maxTokens?: number}} opts
 * @returns {Promise<string>}
 */
async function vision({ system, prompt, imageBase64, mediaType = 'image/jpeg', maxTokens = 512 }) {
  const messages = [];
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
  return res.choices[0]?.message?.content || '';
}

module.exports = { chat, vision, name: 'openai' };
