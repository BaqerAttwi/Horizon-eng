const { answer } = require('../utils/assistant');
const { readRecords, recordIntent } = require('../utils/assistantRecords');
async function chat(req, res, next) {
  const { message, previousTopic } = req.body || {};
  if (typeof message !== 'string' || !message.trim() || message.length > 1000 || (previousTopic !== undefined && (typeof previousTopic !== 'string' || previousTopic.length > 40))) {
    return res.status(400).json({ error:'Enter a message between 1 and 1000 characters.' });
  }
  res.set('Cache-Control', 'no-store');
  try {
    const intent = recordIntent(message.trim(), previousTopic);
    const result = intent ? await readRecords(require('../db/connection'), req.worker, intent, message.trim()) : null;
    return res.json(result || answer(req.worker, message.trim(), previousTopic));
  } catch (error) { return next(error); }
}
module.exports = { chat };
