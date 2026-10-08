import React, { useState } from 'react';
import { Timer } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { DataTable, Panel, Stat } from '../../../suites/ui/kit';
import { FLEXI_DAY_HOURS, FLEXI_MAX_BANK_HOURS } from '../../../data/hcmConfig';
import { flexiBalance, flexiDays, fmt, todayIso } from '../../../data/hcmEngine';
import { Btn, StaffSelect, StatusPill, Toolbar, useCanEdit, useStaff } from './ui';

/** Attendance › Flexi-time bank: extra hours banked (approved by the supervisor) and taken back as flexi days. */
export const FlexiTab: React.FC = () => {
  const { flexiEntries, bankFlexi, redeemFlexi, decideFlexi } = useApp();
  const { current, nameOf } = useStaff();
  const { canEdit } = useCanEdit();
  const [b, setB] = useState({ staffId: '', date: todayIso(), hours: 2, note: '' });
  const [r, setR] = useState({ staffId: '', date: todayIso(), note: '' });
  const people = [...new Set(flexiEntries.map((x) => x.staffId))].filter((id) => current.some((e) => e.staffId === id));
  return (
    <>
      <div className="sx-stats">
        <Stat label="Waiting for approval" value={flexiEntries.filter((x) => x.status === 'PENDING').length} icon={<Timer size={16} />} tone="gold" />
        <Stat label="Hours banked (approved)" value={people.reduce((n, id) => n + Math.max(0, flexiBalance(flexiEntries, id)), 0)} detail={`cap ${FLEXI_MAX_BANK_HOURS} h per person · ${FLEXI_DAY_HOURS} h = 1 flexi day`} icon={<Timer size={16} />} />
      </div>
      <Panel title="Flexi-time bank" subtitle="Time worked beyond the schedule that is not paid as overtime is banked and taken back as whole flexi days. Banked hours are not paid, so payroll is unaffected.">
        <Toolbar>
          <StaffSelect value={b.staffId} onChange={(v) => setB({ ...b, staffId: v })} />
          <input className="form-control" style={{ width: 150 }} type="date" value={b.date} onChange={(e) => setB({ ...b, date: e.target.value })} aria-label="Date worked" />
          <input className="form-control" style={{ width: 80 }} type="number" value={b.hours} onChange={(e) => setB({ ...b, hours: Number(e.target.value) })} aria-label="Hours" />
          <input className="form-control" style={{ width: 220 }} placeholder="What the time was for" value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} />
          <Btn primary disabled={!canEdit} onClick={() => bankFlexi(b.staffId, b.date, b.hours, b.note) && setB({ ...b, note: '' })}>
            Bank hours
          </Btn>
        </Toolbar>
        <Toolbar>
          <StaffSelect value={r.staffId} onChange={(v) => setR({ ...r, staffId: v })} />
          <input className="form-control" style={{ width: 150 }} type="date" value={r.date} onChange={(e) => setR({ ...r, date: e.target.value })} aria-label="Flexi day" />
          <input className="form-control" style={{ width: 220 }} placeholder="Note" value={r.note} onChange={(e) => setR({ ...r, note: e.target.value })} />
          <Btn disabled={!canEdit} onClick={() => redeemFlexi(r.staffId, r.date, r.note)}>
            Request flexi day
          </Btn>
        </Toolbar>
        <DataTable
          rows={people}
          rowKey={(id) => id}
          columns={[
            { key: 'n', header: 'Employee', render: (id) => nameOf(id) },
            { key: 'b', header: 'Balance', align: 'right', render: (id) => `${flexiBalance(flexiEntries, id)} h` },
            { key: 'd', header: 'Flexi days available', align: 'right', render: (id) => flexiDays(flexiBalance(flexiEntries, id)) }
          ]}
        />
      </Panel>
      <Panel title="Entries">
        <DataTable
          rows={flexiEntries}
          rowKey={(x) => x.id}
          columns={[
            { key: 'n', header: 'Employee', render: (x) => nameOf(x.staffId) },
            { key: 'd', header: 'Date', render: (x) => fmt(x.date) },
            { key: 'k', header: 'Entry', render: (x) => (x.kind === 'CREDIT' ? `+${x.hours} h banked` : `Flexi day (−${x.hours} h)`) },
            { key: 'o', header: 'Note', render: (x) => x.note },
            { key: 's', header: 'Status', render: (x) => <StatusPill status={x.status} label={x.decidedBy ? `${x.status.toLowerCase()} · ${x.decidedBy}` : undefined} /> },
            {
              key: 'x',
              header: '',
              render: (x) =>
                x.status === 'PENDING' ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <Btn primary disabled={!canEdit} onClick={() => decideFlexi(x.id, true)}>
                      Approve
                    </Btn>
                    <Btn disabled={!canEdit} onClick={() => decideFlexi(x.id, false)}>
                      Reject
                    </Btn>
                  </span>
                ) : null
            }
          ]}
        />
      </Panel>
    </>
  );
};
