import { writeUrlState } from '../../shared/hooks/url-state.js';

export function readProductEdit(search: string): boolean {
  return new URLSearchParams(search).get('drawer') === 'edit';
}

export function writeProductEdit(input: {
  readonly search: string;
  readonly isOpen: boolean;
}): URLSearchParams {
  return new URLSearchParams(writeUrlState(input.search, { drawer: input.isOpen ? 'edit' : null }));
}
