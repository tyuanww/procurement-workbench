import { writeUrlState } from '../../shared/hooks/url-state.js';

export function readPartyAliasDrawer(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('drawer') !== 'alias') return null;
  const aliasId = params.get('aliasId');
  return aliasId === null || aliasId === '' ? null : aliasId;
}

export function writePartyAliasDrawer(input: {
  readonly search: string;
  readonly aliasId: string;
  readonly isOpen: boolean;
}): URLSearchParams {
  return new URLSearchParams(writeUrlState(input.search, input.isOpen ? { drawer: 'alias', aliasId: input.aliasId } : { drawer: null, aliasId: null }));
}
