import { setupWorker } from 'msw/browser';
import { handlers } from './handlers.js';

export const worker = setupWorker(...handlers);

export async function startMocks(): Promise<void> {
  await worker.start();
}
