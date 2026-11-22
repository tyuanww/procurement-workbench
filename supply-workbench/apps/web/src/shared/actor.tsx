import { createContext, useContext, type ReactNode } from 'react';
import { can, type PermissionAction, type Role } from '@sw/domain';

const ActorRoleContext = createContext<readonly Role[] | null>(null);

export function ActorRoles(props: { readonly roles: readonly Role[]; readonly children: ReactNode }): ReactNode {
  return <ActorRoleContext.Provider value={props.roles}>{props.children}</ActorRoleContext.Provider>;
}

export function useActorRoles(): readonly Role[] {
  return useContext(ActorRoleContext) ?? [];
}

export function useCanWrite(action: PermissionAction): boolean {
  const roles = useContext(ActorRoleContext);
  if (roles === null) return false;
  return can({ roles }, action);
}
