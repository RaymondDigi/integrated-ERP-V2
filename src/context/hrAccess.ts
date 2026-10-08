/**
 * Read-only enforcement for the HR stores. A viewer sign-in may open every HR screen, but each action that
 * changes data is refused in the store itself (not only hidden in the UI). Employees keep their self-service
 * actions (leave, requests, profile) — only the viewer role is read only.
 */
export const READ_ONLY_MESSAGE = 'This is a read-only account. Ask an HR officer or manager to make the change.';

/** Actions that only read and are safe to call for any role. */
const READ_ACTIONS = new Set(['bondRecoveryFor', 'bondFor', 'injuryAbsenceDays', 'lookupWhistleblowing']);

/** Returns the slice unchanged for writers; for a read-only account every action reports the error and does nothing. */
export const guardActions = <T extends object>(slice: T, readOnly: boolean, onBlocked: () => void, blockedReturns: Record<string, unknown> = {}): T => {
  if (!readOnly) return slice;
  const out: Record<string, unknown> = { ...(slice as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out))
    if (typeof v === 'function' && !READ_ACTIONS.has(k))
      out[k] = () => {
        onBlocked();
        return k in blockedReturns ? blockedReturns[k] : undefined;
      };
  return out as T;
};
