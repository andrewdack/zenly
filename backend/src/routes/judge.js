'use strict';

const express = require('express');
const config = require('../config');
const prompts = require('../prompts');
const { getLLM } = require('../llm');

const router = express.Router();

/** Best-effort extraction of the verdict JSON from the model's reply. */
function parseVerdict(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// POST /judge — body: { task, imageBase64, mediaType? }
// Returns: { on_task, confidence, reason }
router.post('/judge', async (req, res) => {
  const { task, imageBase64, mediaType = 'image/jpeg' } = req.body || {};
  if (!task || !imageBase64) {
    res.status(400).json({ error: 'task and imageBase64 are required' });
    return;
  }
  if (!config.llmConfigured()) {
    // Safe default so the app pipeline keeps moving without a key.
    res.json({ on_task: true, confidence: 0, reason: 'llm_not_configured' });
    return;
  }

  try {
    const llm = getLLM();
    const raw = await llm.vision({
      system: prompts.JUDGE_SYSTEM,
      prompt: prompts.judgePrompt(task),
      imageBase64,
      mediaType,
      maxTokens: 300,
    });
    const verdict = parseVerdict(raw) || { on_task: true, confidence: 0, reason: 'unparseable' };
    res.json(verdict);
  } catch (err) {
    console.error('[judge] error:', err);
    res.status(502).json({ error: 'judge_failed', detail: err.message });
  }
});

module.exports = router;
