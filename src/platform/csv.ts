/** CSV export and import shared by every suite. */
export type Cell = string | number | boolean | null | undefined;

const esc = (v: Cell) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (header: string[], rows: Cell[][]) => [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');

export const downloadText = (name: string, text: string, type = 'text/csv') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportCsv = (name: string, header: string[], rows: Cell[][]) => downloadText(`${name.replace(/[^\w-]+/g, '-')}.csv`, toCsv(header, rows));

/** Parses CSV text (quoted fields, embedded commas and newlines) into rows of strings. */
export const parseCsv = (text: string): string[][] => {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) out.push(row);
  return out;
};

/** Parses CSV with a header row into objects keyed by the header names. */
export const parseCsvObjects = (text: string): Record<string, string>[] => {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
};

export const readFileText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
