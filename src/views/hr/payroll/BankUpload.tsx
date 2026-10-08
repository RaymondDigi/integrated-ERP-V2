import React, { useSyncExternalStore } from 'react';
import { CheckCircle2, Download, Upload, ShieldCheck, Landmark } from 'lucide-react';
import type { HREmployee } from '../../../types';
import { kes, payRail } from './reports';

/**
 * Net pay goes to the banks as DME files (one per bank, plus an M-Pesa bulk file), uploaded to the bank's
 * corporate portal ("Chai web") and released there by two authorised signatories. The portal is emulated:
 * uploads return a reference straight away. Status is kept per company and period for this session.
 */

type Stage = 'GENERATED' | 'UPLOADED' | 'AUTHORISED' | 'PAID';
interface FileState {
  stage: Stage;
  generatedOn: string;
  portalRef?: string;
  uploadedOn?: string;
  signatories: string[];
  paidOn?: string;
}

const STAGE_LABEL: Record<Stage, string> = { GENERATED: 'File generated', UPLOADED: 'Uploaded to Chai web', AUTHORISED: 'Authorised', PAID: 'Paid by bank' };
const SIGNATORIES = ['David Otieno (Finance Manager)', 'Amina Hassan (Finance Director)'];

// Tiny store so the status survives switching tabs
let store: Record<string, FileState> = {};
const listeners = new Set<() => void>();
const setFile = (key: string, f: FileState) => {
  store = { ...store, [key]: f };
  listeners.forEach((l) => l());
};
const useFiles = () =>
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => store
  );

const now = () => new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const bankOf = (e: HREmployee) => (payRail(e) === 'M-Pesa' ? 'M-Pesa' : e.bankName ?? (e.bankAccountMasked || 'Bank').split(' ')[0]);
const digits = (s: string) => s.replace(/\D/g, '');

interface Row {
  e: HREmployee;
  p: { net: number };
}

/** Fixed-layout DME text: header, one line per payee, trailer with count, total and a hash of account digits. */
const dmeText = (company: string, period: string, bank: string, rows: Row[]) => {
  const total = rows.reduce((s, r) => s + Math.round(r.p.net), 0);
  const hash = rows.reduce((s, r) => s + Number(digits(payRail(r.e) === 'M-Pesa' ? r.e.mpesaPhoneMasked : r.e.bankAccountMasked).slice(-6) || 0), 0);
  const pad = (v: string | number, n: number, right = false) => (right ? String(v).padStart(n) : String(v).padEnd(n)).slice(0, n);
  return [
    `H${pad(company, 40)}${pad(bank, 20)}${pad(period, 7)}${pad(rows.length, 6, true)}${pad(total, 14, true)}`,
    ...rows.map((r) => `D${pad(r.e.staffId, 10)}${pad(r.e.fullName.toUpperCase(), 35)}${pad(payRail(r.e) === 'M-Pesa' ? r.e.mpesaPhoneMasked : r.e.bankAccountMasked, 24)}${pad(Math.round(r.p.net), 12, true)}${pad(`SALARY ${period}`, 20)}`),
    `T${pad(rows.length, 6, true)}${pad(total, 14, true)}${pad(hash, 12, true)}`
  ].join('\r\n');
};

export const BankUploadCard: React.FC<{ rows: Row[]; company: string; orgId: string; period: { key: string; label: string }; approved: boolean }> = ({ rows, company, orgId, period, approved }) => {
  const files = useFiles();
  const groups = new Map<string, Row[]>();
  rows.filter((r) => r.p.net > 0).forEach((r) => groups.set(bankOf(r.e), [...(groups.get(bankOf(r.e)) ?? []), r]));
  const list = [...groups].sort((a, b) => (a[0] === 'M-Pesa' ? 1 : b[0] === 'M-Pesa' ? -1 : a[0].localeCompare(b[0])));
  const keyOf = (bank: string) => `${orgId}|${period.key}|${bank}`;
  const fileName = (bank: string) => `DME_${orgId.replace('org-', '').toUpperCase()}_${period.key.replace('-', '')}_${bank.replace(/\W+/g, '').toUpperCase()}.txt`;

  const download = (bank: string, rs: Row[]) => {
    const blob = new Blob([dmeText(company, period.key, bank, rs)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName(bank);
    a.click();
    URL.revokeObjectURL(a.href);
    if (!files[keyOf(bank)]) setFile(keyOf(bank), { stage: 'GENERATED', generatedOn: now(), signatories: [] });
  };

  return (
    <div className="pr-card">
      <div className="pr-card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Landmark size={18} color="var(--brand-primary)" />
          <div>
            <h3>Bank payment files (DME) — {period.label}</h3>
            <p>One file per bank and an M-Pesa bulk file. Upload to the bank portal (Chai web), where two signatories release the payment. {approved ? '' : 'Approve the payroll first — files can be generated for checking but not uploaded.'}</p>
          </div>
        </div>
      </div>
      <div className="pr-table-scroll">
        <table className="hr-table pr-table">
          <thead>
            <tr>
              <th>Bank / rail</th>
              <th className="num">Payees</th>
              <th className="num">Amount (KES)</th>
              <th>File</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="hi-empty">
                  No net pay to transfer for this period.
                </td>
              </tr>
            )}
            {list.map(([bank, rs]) => {
              const f = files[keyOf(bank)];
              const total = rs.reduce((s, r) => s + r.p.net, 0);
              return (
                <tr key={bank}>
                  <td>
                    <strong>{bank}</strong>
                  </td>
                  <td className="num">{rs.length}</td>
                  <td className="num">{kes(total)}</td>
                  <td className="hi-mono" style={{ fontSize: 11.5 }}>
                    {fileName(bank)}
                  </td>
                  <td>
                    {f ? (
                      <>
                        <span className={`digicraft-status-pill ${f.stage === 'PAID' ? 'success' : f.stage === 'GENERATED' ? 'info' : 'warning'}`}>{STAGE_LABEL[f.stage]}</span>
                        <div className="hi-sub">
                          {f.stage === 'GENERATED' && `Generated ${f.generatedOn}`}
                          {f.stage === 'UPLOADED' && `${f.portalRef} · ${f.uploadedOn} · awaiting ${2 - f.signatories.length} signator${2 - f.signatories.length === 1 ? 'y' : 'ies'}`}
                          {f.stage === 'AUTHORISED' && `${f.portalRef} · released by ${f.signatories.map((s) => s.split(' (')[0]).join(' & ')}`}
                          {f.stage === 'PAID' && `${f.portalRef} · credited ${f.paidOn}`}
                        </div>
                      </>
                    ) : (
                      <span className="hi-sub">Not generated</span>
                    )}
                  </td>
                  <td>
                    <div className="pr-toolbar" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => download(bank, rs)} title="Download the DME file">
                        <Download size={13} /> DME
                      </button>
                      {f?.stage === 'GENERATED' && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={!approved}
                          title={approved ? 'Send the file to the bank portal' : 'Approve the payroll first'}
                          onClick={() => setFile(keyOf(bank), { ...f, stage: 'UPLOADED', uploadedOn: now(), portalRef: `CW-${period.key.replace('-', '')}-${String(Math.abs([...bank].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % 100000).padStart(5, '0')}` })}
                        >
                          <Upload size={13} /> Upload to Chai web
                        </button>
                      )}
                      {f?.stage === 'UPLOADED' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            const signatories = [...f.signatories, SIGNATORIES[f.signatories.length]];
                            setFile(keyOf(bank), { ...f, signatories, stage: signatories.length >= 2 ? 'AUTHORISED' : 'UPLOADED' });
                          }}
                        >
                          <ShieldCheck size={13} /> Authorise as {SIGNATORIES[f.signatories.length].split(' (')[0]}
                        </button>
                      )}
                      {f?.stage === 'AUTHORISED' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setFile(keyOf(bank), { ...f, stage: 'PAID', paidOn: now() })}>
                          <CheckCircle2 size={13} /> Confirm credited
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pr-muted" style={{ marginTop: 8 }}>
        Each file has a header, one line per payee and a trailer with the count, total and a hash of account numbers, so the bank can reject a file that was altered. The bank portal here is simulated.
      </p>
    </div>
  );
};
