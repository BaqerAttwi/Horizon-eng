const { randomUUID } = require('crypto');

function describeError(err, req = {}) {
  const code = err.code;
  if (code === 'LIMIT_FILE_SIZE') return { status: 413, message: 'The file is too large. Please choose a file smaller than 20 MB.' };
  if (code?.startsWith('LIMIT_')) return { status: 400, message: 'The upload could not be accepted. Please choose one file in the supported format.' };
  if (err.type === 'entity.parse.failed') return { status: 400, message: 'The request contains invalid data. Refresh the page and try again.' };
  if (err.type === 'entity.too.large') return { status: 413, message: 'There is too much data in this request. Please submit a smaller batch.' };
  if (code === 'ER_DUP_ENTRY') return { status: 409, message: 'A record with this identifier already exists. Please use a different identifier.' };
  if (code === 'ER_NO_REFERENCED_ROW_2') return { status: 400, message: 'A selected record no longer exists. Refresh the page and select it again.' };
  if (code === 'ER_ROW_IS_REFERENCED_2') return { status: 409, message: 'This record is still used elsewhere. Remove its related records before deleting it.' };
  if (['ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD', 'WARN_DATA_TRUNCATED', 'ER_BAD_NULL_ERROR'].includes(code)) return { status: 400, message: 'One or more fields contain an invalid value. Check required fields, dates, numbers and text lengths.' };
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ER_ACCESS_DENIED_ERROR'].includes(code)) return { status: 503, message: 'The database is temporarily unavailable. Please try again shortly. If this continues, contact your administrator.' };
  if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(code)) return { status: 409, message: 'Another change is being saved at the same time. Please try this change again.' };
  if (['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE'].includes(code)) return { status: 503, message: 'This feature needs a database update on the server. Please contact your administrator.' };
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  if (status < 500 && err.message) return { status, message: err.message };
  const action = req.method === 'GET' ? 'load this information' : 'complete this change';
  return { status, message: `The server could not ${action}. Please try again. If this continues, contact your administrator with the error reference.` };
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const reference = randomUUID();
  const { status, message } = describeError(err, req);
  console.error(`[Server error ${reference}] ${req.method} ${req.path}`, err.code || '', err.message, err.stack);
  res.status(status).json({ error: message, reference });
}

module.exports = { describeError, errorHandler };
