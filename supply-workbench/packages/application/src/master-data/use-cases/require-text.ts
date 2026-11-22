import { ValidationFailedError } from '../../shared/errors.js';

export function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed === '') throw new ValidationFailedError(message);
  return trimmed;
}
