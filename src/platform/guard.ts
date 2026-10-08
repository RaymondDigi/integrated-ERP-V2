import { sessionRole } from '../auth/session';

/**
 * Store-level permission checks for platform configuration. Screens hide buttons too, but these run inside the
 * write functions so a viewer or non-administrator is refused whatever calls them.
 */
export const READ_ONLY_MESSAGE = 'This is a read-only account — you can view records but not change them';

/** Null when the signed-in account may change records, otherwise the reason it may not. */
export const writeDenied = (): string | null => {
  const r = sessionRole();
  return r === 'admin' || r === 'manager' || r === 'member' ? null : READ_ONLY_MESSAGE;
};
/** Null when the signed-in account is an administrator, otherwise the reason it is refused. */
export const adminDenied = (): string | null => {
  const r = sessionRole();
  if (r === 'admin') return null;
  return r === 'viewer' || r === 'employee' || !r ? READ_ONLY_MESSAGE : 'Only an administrator can change this';
};
