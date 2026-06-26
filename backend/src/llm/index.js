'use strict';

const config = require('../config');

// Provider registry. Both modules expose the SAME interface:
//   chat({ system, messages, maxTokens }) -> Promise<string>
//   vision({ system, prompt, imageBase64, mediaType, maxTokens }) -> Promise<string>
// To add a provider (Gemini, local, ...), implement those two functions and register here.
const providers = {
  anthropic: require('./anthropic'),
  openai: require('./openai'),
};

/** Returns the active LLM provider chosen by LLM_PROVIDER. */
function getLLM() {
  const provider = providers[config.llm.provider];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${config.llm.provider}". Valid: ${Object.keys(providers).join(', ')}`,
    );
  }
  return provider;
}

module.exports = { getLLM };
