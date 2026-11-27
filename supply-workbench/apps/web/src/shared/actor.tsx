import { createContext, useContext, type ReactNode } from 'react';
import { can, type PermissionAction, type Role } from '@sw/domain';

const ActorRoleContext = createContext<{ readonly roles: readonly Role[]; readonly userId?: string } | null>(null);

export function ActorRoles(props: { readonly roles: readonly Role[]; readonly userId?: string; readonly children: ReactNode }): ReactNode {
  return <ActorRoleContext.Provider value={props}>{props.children}</ActorRoleContext.Provider>;
}

export function useActorRoles(): readonly Role[] {
  return useContext(ActorRoleContext)?.roles ?? [];
}

export function useActorId(): string | undefined {
  return useContext(ActorRoleContext)?.userId;
}

export function useCan(action: PermissionAction): boolean {
  const roles = useContext(ActorRoleContext);
  if (roles === null) return false;
  return can(roles, action);
}

export { useCan as useCanWrite };
