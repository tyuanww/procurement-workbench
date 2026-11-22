import { writeUrlState } from '../../shared/hooks/url-state.js';

export function readImportConflictDrawer(search: string): boolean {
  return new URLSearchParams(search).get('drawer') === 'conflicts';
}

export function writeImportConflictDrawer(input: { readonly search: string; readonly isOpen: boolean }): URLSearchParams {
  return new URLSearchParams(writeUrlState(input.search, { drawer: input.isOpen ? 'conflicts' : null }));
}
