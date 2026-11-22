import type { TemplateId } from '@sw/domain';

export type DetectCandidate = {
  readonly template: TemplateId;
  readonly score: number;
  readonly reasons: readonly string[];
};

export type ImportTypeChoice =
  | { readonly kind: 'unselected' }
  | { readonly kind: 'selected'; readonly template: TemplateId };

export function templateNeedsFactory(template: TemplateId): boolean {
  return template === 'factory-progress-v1';
}

export function selectedTemplate(choice: ImportTypeChoice): TemplateId | null {
  return choice.kind === 'selected' ? choice.template : null;
}

export function recommendedTemplate(candidates: readonly DetectCandidate[]): ImportTypeChoice {
  const exact = candidates.filter((item) => item.score === 100);
  const match = exact[0];
  return exact.length === 1 && match !== undefined
    ? { kind: 'selected', template: match.template }
    : { kind: 'unselected' };
}

export function topIsTied(candidates: readonly DetectCandidate[]): boolean {
  const top = highestScore(candidates);
  if (top === null) return false;
  return candidates.filter((item) => item.score === top).length > 1;
}

export function canSubmitImport(input: {
  readonly choice: ImportTypeChoice;
  readonly candidates: readonly DetectCandidate[];
  readonly factoryPartyId: string | null;
}): boolean {
  const template = selectedTemplate(input.choice);
  if (template === null) return false;
  if (!input.candidates.some((item) => item.template === template)) return false;
  if (!templateNeedsFactory(template)) return true;
  return input.factoryPartyId !== null && input.factoryPartyId !== '';
}

function highestScore(candidates: readonly DetectCandidate[]): number | null {
  const first = candidates[0];
  if (first === undefined) return null;
  return candidates.reduce((max, item) => item.score > max ? item.score : max, first.score);
}
