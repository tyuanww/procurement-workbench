import { can, type Role } from '@sw/domain';

export type DeskUser = { readonly id: string; readonly name: string };

export function userDirectoryPath(roles: readonly Role[]): '/api/v1/users' | null {
  if (can({ roles }, 'admin')) return '/api/v1/users';
  return null;
}

export function ownerOptions(input: {
  readonly roles: readonly Role[];
  readonly self: DeskUser;
  readonly directory: readonly DeskUser[];
}): readonly DeskUser[] | null {
  if (userDirectoryPath(input.roles) !== null) return input.directory;
  if (can({ roles: input.roles }, 'lines.write')) return [input.self];
  return null;
}
