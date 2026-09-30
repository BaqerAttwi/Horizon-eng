const STATUS_MESSAGES = {
  400: 'Some information is invalid or missing. Check the form and try again.',
  401: 'Your session has expired. Please log in again.',
  403: 'You do not have permission to perform this action.',
  404: 'This record or feature could not be found. Refresh the page and try again.',
  409: 'This change conflicts with an existing record. Refresh the page and check your information.',
  413: 'The file or request is too large. Please choose a smaller file or batch.',
  423: 'This quotation is locked after approval. Contact the owner or Head of Engineering.',
  429: 'Too many requests were sent. Please wait a moment before trying again.',
  500: 'The server could not complete this request. Please try again. If this continues, contact your administrator.',
  502: 'The server is currently unreachable. Please try again shortly.',
  503: 'This service is temporarily unavailable. Please try again shortly.',
  504: 'The server took too long to respond. Please try again shortly.',
};

export function getErrorMessage(err) {
  const status = err.response?.status || 0;
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return 'The request took too long. Check whether your change was saved before trying again.';
  if (!status) return 'Unable to reach the server. Check your connection and try again.';
  const data = err.response?.data;
  const supplied = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : '';
  const generic = !supplied.trim() || /^(internal server error|request failed with status code \d+|error|\d{3})[.!]?$/i.test(supplied.trim());
  const message = generic ? STATUS_MESSAGES[status] || (status >= 500 ? STATUS_MESSAGES[500] : 'The request could not be completed. Refresh the page and try again.') : supplied;
  const reference = typeof data?.reference === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(data.reference) ? data.reference : null;
  return reference ? `${message} Error reference: ${reference}` : message;
}
