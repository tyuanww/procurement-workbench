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
  readonly destinations?: readonly NavDestination[];
};

export type NavDestination = {
  readonly to: string;
  readonly label: string;
  readonly gate?: PageGate;
  readonly aliases?: readonly string[];
};
