import { LocalDateSchema, PersonalTodayScopeSchema, type PersonalTodayScope } from '@sw/contracts';

export type WorkspaceView = 'list' | 'board' | 'calendar';

export type WorkspaceSelection = { readonly scope?: PersonalTodayScope; readonly view?: WorkspaceView; readonly date?: string; readonly page?: number };
export type SavedLocation = { readonly id: string; readonly scope: PersonalTodayScope; readonly date: string };
export type WorkspaceNavigation = { readonly kind: 'select'; readonly selection: WorkspaceSelection }
  | { readonly kind: 'open'; readonly id: string }
  | { readonly kind: 'close'; readonly page: number | undefined }
  | { readonly kind: 'saved'; readonly location: SavedLocation };

export function workspaceQuery(params: URLSearchParams) {
  const view = workspaceView(params.get('view'));
  const scope: PersonalTodayScope = PersonalTodayScopeSchema.safeParse(params.get('scope')).data ?? (view === 'list' ? 'pending' : 'all');
  const rawPage = Number(params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const drawer = params.get('drawer');
  const focus = drawer ?? params.get('focus');
  const request = new URLSearchParams({ scope, page: String(page) });
  if (focus) request.set('focusId', focus);
  if (view === 'calendar') request.set('calendar', LocalDateSchema.safeParse(params.get('date')).data ?? 'today');
  return { scope, view, page, drawer, focus, request: request.toString() };
}

function workspaceView(value: string | null): WorkspaceView {
  return value === 'board' || value === 'calendar' ? value : 'list';
}

export function workspaceParams(params: URLSearchParams, navigation: WorkspaceNavigation): URLSearchParams {
  const next = new URLSearchParams(params);
  if (navigation.kind === 'open') {
    next.set('drawer', navigation.id);
    next.set('focus', navigation.id);
    return next;
  }
  next.delete('drawer');
  next.delete('page');
  if (navigation.kind === 'close') {
    if (navigation.page !== undefined && navigation.page > 1) next.set('page', String(navigation.page));
  } else if (navigation.kind === 'saved') {
    const { id, scope, date } = navigation.location;
    next.set('scope', scope);
    next.set('focus', id);
    if (params.get('view') === 'calendar') {
      if (date === '') next.delete('view');
      else next.set('date', date);
    }
  } else {
    next.delete('focus');
    for (const [key, value] of Object.entries(navigation.selection)) next.set(key, String(value));
  }
  return next;
}
