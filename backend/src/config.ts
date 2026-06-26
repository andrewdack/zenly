import 'dotenv/config';

const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  deeplinkScheme: process.env.DEEPLINK_SCHEME ?? 'zenly',

  llm: {
    provider: (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase(),
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
  },

  llmConfigured(): boolean {
    if (this.llm.provider === 'openai') return Boolean(this.openai.apiKey);
    return Boolean(this.anthropic.apiKey);
  },
};

export default config;
