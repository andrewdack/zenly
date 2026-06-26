import config from '../config';
import type { LLMProvider } from '../types';
import anthropicProvider from './anthropic';
import openaiProvider from './openai';

const providers: Record<string, LLMProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export function getLLM(): LLMProvider {
  const provider = providers[config.llm.provider];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${config.llm.provider}". Valid: ${Object.keys(providers).join(', ')}`
    );
  }
  return provider;
}
