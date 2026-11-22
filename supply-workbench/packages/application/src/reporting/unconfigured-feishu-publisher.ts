import type { DocumentPublisher } from '../ports/document-publisher.js';
import { FeishuNotConfiguredError } from '../shared/errors.js';

export function unconfiguredFeishuPublisher(): DocumentPublisher {
  return { publish: () => Promise.reject(new FeishuNotConfiguredError()) };
}
