import React, { useState } from 'react';
import { Eye, RotateCcw, ScanLine } from 'lucide-react';
import { useAccess } from '../../../platform/access';
import { OpsActorSwitcher } from '../parts';
import { useOperations } from '../store';
import { useWarehouseExt } from './store';
import { useShippingExt } from '../shipping/store';

/** Sidebar footer for Warehousing and Shipping: persona switcher plus a reset that restores every logistics record. */
export const LogisticsFooter: React.FC = () => {
  const { reset } = useOperations();
  const wh = useWarehouseExt();
  const shp = useShippingExt();
  return (
    <div className="sx-side-actor">
      <OpsActorSwitcher />
      <button
        type="button"
        className="sx-link sx-reset"
        onClick={() => {
          reset();
          wh.reset();
          shp.reset();
        }}
      >
        <RotateCcw size={12} /> Reset demo data
      </button>
    </div>
  );
};

/** Shown on every logistics page for read-only sign-ins. */
export const ReadOnlyNote: React.FC = () => {
  const { readOnly } = useAccess();
  return readOnly ? (
    <div className="sx-callout warn">
      <Eye size={16} />
      <div>
        <b>Read-only account</b>
        <span>You can browse every record, but changes are refused.</span>
      </div>
    </div>
  ) : null;
};

/** Marks a screen or button that simulates an external device or system in this build. */
export const SimBadge: React.FC<{ text?: string }> = ({ text = 'Simulated' }) => (
  <span className="sx-pill sx-pill-info" title="No hardware or external system is connected in this build — readings and responses are generated">
    <i />
    {text}
  </span>
);

/** Barcode / RFID scan input: scanners type the code and press Enter (keyboard wedge). */
export const ScanBox: React.FC<{ onScan: (code: string) => void; placeholder?: string }> = ({ onScan, placeholder = 'Scan barcode or RFID tag…' }) => {
  const [v, setV] = useState('');
  return (
    <form
      className="sx-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onScan(v.trim());
        setV('');
      }}
    >
      <ScanLine size={16} />
      <input className="form-control" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button type="submit" className="btn btn-secondary btn-sm">
        Look up
      </button>
    </form>
  );
};

export const num = (n: number) => Math.round(n).toLocaleString('en-KE');
