import { apiErrorMessage } from '../../shared/api/client.js';
import type { UiNotice } from '../../shared/ui/notice.js';

export function reportSettingsError(input: {
  readonly setMessage: (message: UiNotice | null) => void;
  readonly error: unknown;
  readonly fallback: string;
}): void {
  const message = apiErrorMessage(input.error);
  if (message === undefined) throw input.error;
  input.setMessage({ kind: 'error', text: message || input.fallback });
}
