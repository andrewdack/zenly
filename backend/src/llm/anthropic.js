'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

// Lazily constructed so the server can boot (and echo) without a key.
let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.anthropic.apiKey });
  return client;
}

function textFrom(message) {
  return (message.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Multi-turn text chat.
 * @param {{system?: string, messages: {role:'user'|'assistant', content:string}[], maxTokens?: number}} opts
 * @returns {Promise<string>}
 */
async function chat({ system, messages, maxTokens = 1024 }) {
  const res = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages,
  });
  return textFrom(res);
}

/**
 * Single-image vision call.
 * @param {{system?: string, prompt: string, imageBase64: string, mediaType?: string, maxTokens?: number}} opts
 * @returns {Promise<string>}
 */
async function vision({ system, prompt, imageBase64, mediaType = 'image/jpeg', maxTokens = 512 }) {
  const res = await getClient().messages.create({
    model: config.anthropic.model,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  return textFrom(res);
}

module.exports = { chat, vision, name: 'anthropic' };
