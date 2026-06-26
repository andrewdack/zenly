import { Router } from 'express';
import config from '../config';
import { SNITCH_SYSTEM, snitchPrompt } from '../prompts';
import * as store from '../store/sessions';
import { getLLM } from '../llm';
import { sendMessage } from '../services/imessage';

const router = Router();

router.post('/snitch', async (req, res) => {
  const { task, contactPhone, screenContent, userPhone } = req.body ?? {};
  if (!task || !contactPhone || !screenContent) {
    res.status(400).json({ error: 'task, contactPhone, and screenContent are required' });
    return;
  }

  let message: string | undefined;
  if (config.llmConfigured()) {
    try {
      const llm = getLLM();
      message = (
        await llm.chat({
          system: SNITCH_SYSTEM,
          messages: [{ role: 'user', content: snitchPrompt(task as string, screenContent as string) }],
          maxTokens: 120,
        })
      ).trim();
    } catch (err) {
      console.error('[snitch] llm error:', err);
    }
  }
  if (!message) {
    message = `Your friend swore they'd be "${task}" but got caught ${screenContent}. Just so you know. 👀`;
  }

  const result = await sendMessage(contactPhone as string, message);
  if (userPhone) store.recordSnitch(userPhone as string);
  res.json({ message, ...result });
});

export default router;
