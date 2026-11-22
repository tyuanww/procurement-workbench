export type PageGate = 'always' | 'oversight' | 'review' | 'admin';

export type NavPath =
  | '/progress'
  | '/today'
  | '/lines'
  | '/dashboard'
  | '/reports'
  | '/products'
  | '/imports'
  | '/master'
  | '/settings';

export type NavRoute = {
  readonly to: NavPath;
  readonly label: string;
  readonly gate: PageGate;
};
