import { useSession, type Role } from '../auth/session';

/**
 * What the signed-in account may do. Viewers are read only everywhere; employees only reach self-service.
 * Suites still apply their own maker-checker rules on top of this.
 */
export const canWrite = (role: Role | undefined) => role === 'admin' || role === 'manager' || role === 'member';
export const canApprove = (role: Role | undefined) => role === 'admin' || role === 'manager';

export const useAccess = () => {
  const s = useSession();
  return { role: s?.role, name: s?.name ?? 'Unknown', canWrite: canWrite(s?.role), canApprove: canApprove(s?.role), readOnly: !canWrite(s?.role) };
};
