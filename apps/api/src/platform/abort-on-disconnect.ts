import { type Response } from 'express';

/**
 * Aborts when the client goes away before the response is complete, so a long upload or import
 * stops copying bytes nobody will receive. A finished response never aborts.
 */
export function abortOnDisconnect(response: Response): AbortSignal {
  const controller = new AbortController();
  response.on('close', () => {
    if (!response.writableFinished) controller.abort();
  });
  return controller.signal;
}
