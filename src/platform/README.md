# Shared platform services

Use these from any suite instead of building local copies.

| Need | Use |
|---|---|
| Email / SMS / in-app notice (simulated gateway) | `notify({ module, to, subject, body?, ref?, address?, level?, channels? })` from `platform/outbox` |
| Field-level change history / audit trail | `audit({ module, by, action, ref?, field?, before?, after?, note? })`, `auditChanges(module, by, ref, before, after, fields?)` from `platform/audit` |
| File attachments on a record | `<Attachments owner="suite:REF" by={actor.name} readOnly? />` from `platform/Widgets` |
| CSV export / import | `<ExportCsvButton name header rows={() => rows} />`, `<ImportCsvButton template onImport={(rows) => ({ imported, errors })} />`, `exportCsv`, `parseCsvObjects` |
| Printable document / PDF | `printDocument(title, html)`, `<PrintButton title html={() => html} />`, `esc()` for escaping |
| Electronic signature | `<SignModal signer meaning onSign={(sig) => …} onClose />` (typed name + PIN 1234) |
| Signed-in role | `useAccess()` from `platform/access` → `{ role, canWrite, canApprove, readOnly }` (viewer = read only) |

Everything is in memory for the session, like the rest of the app. The Notification bell in the header shows
alerts, the simulated email/SMS outbox and the change log.
