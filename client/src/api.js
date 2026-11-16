// A tiny wrapper around fetch for our own /api.
// Every failure becomes an Error with a readable `message` and a `code`,
// so screens can show the message and special-case known codes.

export class RequestError extends Error {
  constructor(message, { code = 'request_failed', status = 0, retryAfterSeconds = null } = {}) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export async function getJson(path, signal) {
  let response;

  try {
    response = await fetch(`/api${path}`, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new RequestError(
      'Could not reach the API server. Is it running? (npm run dev:api)',
      { code: 'offline' }
    );
  }

  // The server always answers with JSON, but guard against a crashed proxy.
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new RequestError(body.message || `Request failed with status ${response.status}.`, {
      code: body.error || 'request_failed',
      status: response.status,
      retryAfterSeconds: body.retryAfterSeconds ?? null,
    });
  }

  return body;
}
