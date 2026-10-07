import React, { useEffect } from 'react';
import { RotateCcw, UserRound } from 'lucide-react';
import { useControl } from './store';
import { CTL_ACTORS } from './data';
import type { CtlRole } from './types';

export const CtlFooter: React.FC = () => {
  const { actor, setActor, reset } = useControl();
  return (
    <div className="sx-side-actor">
      <div className="sx-actor">
        <span className="sx-actor-label">
          <UserRound size={13} /> Acting as
        </span>
        <select value={actor.role} onChange={(e) => setActor(e.target.value as CtlRole)} aria-label="Acting as">
          {(Object.keys(CTL_ACTORS) as CtlRole[]).map((r) => (
            <option key={r} value={r}>
              {CTL_ACTORS[r].name} — {CTL_ACTORS[r].title}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="sx-link sx-reset" onClick={reset}>
        <RotateCcw size={12} /> Reset demo data
      </button>
    </div>
  );
};

export const useCtlFocus = (focus: string | null, has: (id: string) => boolean, open: (id: string) => void, openNew?: () => void) => {
  const { clearFocus } = useControl();
  useEffect(() => {
    if (!focus) return;
    if (focus === 'new') openNew?.();
    else if (has(focus)) open(focus);
    clearFocus();
  }, [focus]);
};
