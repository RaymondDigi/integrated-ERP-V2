import React, { useEffect } from 'react';
import { ChevronRight, RotateCcw, UserRound } from 'lucide-react';
import { useOperations } from './store';
import { OPS_ACTORS } from './data';
import { ROLE_LABEL } from './engine';
import type { OpsRole } from './types';

export const OpsActorSwitcher: React.FC = () => {
  const { actor, setActor } = useOperations();
  return (
    <div className="sx-actor">
      <span className="sx-actor-label">
        <UserRound size={13} /> Acting as
      </span>
      <select value={actor.role} onChange={(e) => setActor(e.target.value as OpsRole)} aria-label="Acting as">
        {(Object.keys(OPS_ACTORS) as OpsRole[]).map((r) => (
          <option key={r} value={r}>
            {OPS_ACTORS[r].name} — {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </div>
  );
};

export const OpsFooter: React.FC = () => {
  const { reset } = useOperations();
  return (
    <div className="sx-side-actor">
      <OpsActorSwitcher />
      <button type="button" className="sx-link sx-reset" onClick={reset}>
        <RotateCcw size={12} /> Reset demo data
      </button>
    </div>
  );
};

export const Crumb: React.FC<{ name: string; page: string; label: string; onHome: () => void }> = ({ name, page, label, onHome }) => (
  <span className="sx-crumb">
    <button type="button" onClick={onHome}>
      {name}
    </button>
    {page !== 'overview' && (
      <>
        <ChevronRight size={11} />
        <b>{label}</b>
      </>
    )}
  </span>
);

/** Scrolls the content back to the top whenever the page changes. */
export const useTopOnChange = (key: string) => {
  useEffect(() => {
    document.getElementById('main-content')?.scrollTo({ top: 0 });
  }, [key]);
};

/** Opens a record when another screen asks for it (focus), or the editor for "new". */
export const useFocus = (focus: string | null, has: (id: string) => boolean, open: (id: string) => void, openNew?: () => void) => {
  const { clearFocus } = useOperations();
  useEffect(() => {
    if (!focus) return;
    if (focus === 'new') openNew?.();
    else if (has(focus)) open(focus);
    clearFocus();
  }, [focus]);
};
