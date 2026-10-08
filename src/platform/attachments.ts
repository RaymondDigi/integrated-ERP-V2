import { createBus, pid, stamp } from './bus';

/**
 * Files attached to any record, keyed by the record they belong to. Files are read in the browser and kept with
 * the session's data (no file server in this build), so they can be previewed and downloaded again.
 */
export interface Attachment {
  id: string;
  /** Record key, e.g. "procurement:PO-2026-0004" */
  owner: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  by: string;
  at: string;
  /** Who outside the company may see it (supplier, customer, auditor) */
  sharedWith?: string;
  version: number;
}

const bus = createBus<Attachment>();
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const addAttachment = (owner: string, file: File, by: string, sharedWith?: string) =>
  new Promise<Attachment>((resolve, reject) => {
    if (file.size > MAX_ATTACHMENT_BYTES) return reject(new Error(`${file.name} is larger than 5 MB`));
    const r = new FileReader();
    r.onload = () => {
      const prior = bus.all().filter((a) => a.owner === owner && a.name === file.name);
      const a: Attachment = { id: pid('at'), owner, name: file.name, size: file.size, type: file.type || 'application/octet-stream', dataUrl: String(r.result), by, at: stamp(), sharedWith, version: prior.length + 1 };
      bus.push(a);
      resolve(a);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

export const removeAttachment = (id: string) => bus.set(bus.all().filter((a) => a.id !== id));
export const attachmentsFor = (owner: string) => bus.all().filter((a) => a.owner === owner);
export const useAttachments = bus.use;
