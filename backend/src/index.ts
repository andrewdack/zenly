import 'dotenv/config';
import express from 'express';
import config from './config';
import { getSDK } from './services/imessage';
import { handleMessage } from './agent/handler';
import judgeRoute from './routes/judge';
import snitchRoute from './routes/snitch';
import sessionRoute from './routes/session';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '15mb' }));

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'zenly-backend',
    llmProvider: config.llm.provider,
    llmConfigured: config.llmConfigured(),
  });
});

app.use(judgeRoute);
app.use(snitchRoute);
app.use(sessionRoute);

app.listen(config.port, () => {
  console.log(`Zenly backend on :${config.port}`);
  console.log(`  LLM: ${config.llm.provider} (configured: ${config.llmConfigured()})`);
  if (!config.llmConfigured()) {
    console.log('  NOTE: no LLM key — agent will echo, /judge returns on_task:true.');
  }
});

async function startWatcher(): Promise<void> {
  const sdk = getSDK();
  await sdk.startWatching({
    onDirectMessage: async (msg) => {
      const { participant: from, text, chatId } = msg;
      if (!text || !from || !chatId) return;
      console.log(`[agent] <- ${from}: ${text.slice(0, 80)}`);
      const reply = await handleMessage(from, text.trim());
      console.log(`[agent] -> ${from}: ${reply.slice(0, 80)}`);
      await sdk.send({ to: chatId, text: reply });
    },
    onError: (err: unknown) => {
      console.error('[imessage] watcher error:', err);
    },
  });
  console.log('  iMessage watcher active — listening for DMs.');
}

startWatcher().catch((err: unknown) => {
  console.error('[imessage] failed to start watcher:', err);
  console.error('  → Grant Full Disk Access to Terminal/Node in System Preferences > Privacy & Security.');
});
