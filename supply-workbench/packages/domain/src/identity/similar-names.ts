import { isForbiddenPair, isUnsuggestedName } from './forbidden-pairs.js';
import { normalizeText } from './text.js';

export function similarNames(name: string, all: readonly string[]): string[] {
  const query = normalizeText(name);
  if (query === '' || isUnsuggestedName(name)) return [];
  return all.filter((candidate) => isSimilar(query, candidate));
}

function isSimilar(query: string, candidate: string): boolean {
  const other = normalizeText(candidate);
  if (other === '' || other === query) return false;
  if (isForbiddenPair(query, other) || isUnsuggestedName(candidate)) return false;
  return other.includes(query) || query.includes(other) || withinOneEdit(query, other);
}

function withinOneEdit(left: string, right: string): boolean {
  const a = [...left];
  const b = [...right];
  if (a.length === b.length) return substitutions(a, b) === 1;
  if (Math.abs(a.length - b.length) !== 1) return false;
  return a.length > b.length ? isOneInsertion(a, b) : isOneInsertion(b, a);
}

function substitutions(left: readonly string[], right: readonly string[]): number {
  let count = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) count += 1;
  }
  return count;
}

function isOneInsertion(longer: readonly string[], shorter: readonly string[]): boolean {
  let hasSkipped = false;
  for (let index = 0; index < shorter.length; index += 1) {
    const offset = hasSkipped ? 1 : 0;
    if (shorter[index] === longer[index + offset]) continue;
    if (hasSkipped || shorter[index] !== longer[index + 1]) return false;
    hasSkipped = true;
  }
  return true;
}
