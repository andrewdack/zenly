import { Router } from 'express';
import * as store from '../store/sessions';
import { startLink } from '../util/deeplink';

const router = Router();

router.post('/session/start', (req, res) => {
  const { userPhone, task, durationMinutes } = req.body ?? {};
  if (!userPhone || !task) {
    res.status(400).json({ error: 'userPhone and task are required' });
    return;
  }
  const mins = durationMinutes ? parseInt(durationMinutes as string, 10) : null;
  const session = store.startSession(userPhone as string, {
    task: task as string,
    durationMinutes: mins,
  });
  res.json({ session, deeplink: startLink({ task: task as string, durationMinutes: mins }) });
});

router.get('/session/:phone', (req, res) => {
  const session = store.getSession(req.params.phone);
  if (!session) {
    res.json({ active: false });
    return;
  }
  res.json({
    active: true,
    session,
    stats: store.get(req.params.phone).stats,
    deeplink: startLink({ task: session.task, durationMinutes: session.durationMinutes ?? null }),
  });
});

export default router;
