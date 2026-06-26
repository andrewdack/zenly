import { Router } from 'express';
import config from '../config';
import { JUDGE_SYSTEM, judgePrompt } from '../prompts';
import { getLLM } from '../llm';
import type { JudgeVerdict } from '../types';

const router = Router();

function parseVerdict(text: string): JudgeVerdict | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as JudgeVerdict;
  } catch {
    return null;
  }
}

router.post('/judge', async (req, res) => {
  const { task, imageBase64, mediaType = 'image/jpeg' } = req.body ?? {};
  if (!task || !imageBase64) {
    res.status(400).json({ error: 'task and imageBase64 are required' });
    return;
  }
  if (!config.llmConfigured()) {
    res.json({ on_task: true, confidence: 0, reason: 'llm_not_configured' });
    return;
  }
  try {
    const llm = getLLM();
    const raw = await llm.vision({
      system: JUDGE_SYSTEM,
      prompt: judgePrompt(task as string),
      imageBase64: imageBase64 as string,
      mediaType: mediaType as string,
      maxTokens: 300,
    });
    const verdict = parseVerdict(raw) ?? { on_task: true, confidence: 0, reason: 'unparseable' };
    res.json(verdict);
  } catch (err) {
    console.error('[judge] error:', err);
    res.status(502).json({ error: 'judge_failed', detail: (err as Error).message });
  }
});

export default router;
