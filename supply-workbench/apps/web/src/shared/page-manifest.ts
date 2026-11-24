export type PageGate = 'always' | 'oversight' | 'imports' | 'review' | 'admin';

export const SETTINGS_PATH = '/settings';

export type NavPath =
  | '/progress'
  | '/today'
  | '/lines'
  | '/dashboard'
  | '/products'
  | '/imports';

export type NavRoute = {
  readonly to: NavPath;
  readonly label: string;
  readonly gate: PageGate;
  readonly matchPaths: readonly string[];
};
