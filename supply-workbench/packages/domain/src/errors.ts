import type { DomainRuleCode } from './vocabulary/index.js';

export class DomainRuleViolation extends Error {
  readonly code: DomainRuleCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor({ code, message, details = {} }: { readonly code: DomainRuleCode; readonly message: string; readonly details?: Readonly<Record<string, unknown>> | undefined }) {
    super(message);
    this.name = 'DomainRuleViolation';
    this.code = code;
    this.details = { ...details };
  }
}
