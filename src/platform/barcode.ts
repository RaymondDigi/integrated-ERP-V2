/**
 * Code 128 (set B) barcodes as SVG, for labels on assets, stock and documents. Readable by any standard
 * handheld scanner. No library: the symbol table below is the published Code 128 bar/space width table.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];
const START_B = 104;
const STOP = 106;

/** Module widths (bar, space, bar…) for the text, including start, checksum and stop. */
export const code128 = (text: string) => {
  const codes = [START_B];
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    codes.push(c >= 32 && c <= 126 ? c - 32 : 0);
  }
  const check = codes.reduce((s, c, i) => s + c * (i === 0 ? 1 : i), 0) % 103;
  codes.push(check, STOP);
  return codes.map((c) => PATTERNS[c]).join('');
};

/** SVG markup for a barcode with the human-readable text underneath. */
export const barcodeSvg = (text: string, opts: { module?: number; height?: number; caption?: string } = {}) => {
  const m = opts.module ?? 1.6;
  const h = opts.height ?? 48;
  const widths = code128(text);
  const quiet = 10 * m;
  let x = quiet;
  const bars: string[] = [];
  [...widths].forEach((w, i) => {
    const wpx = Number(w) * m;
    if (i % 2 === 0) bars.push(`<rect x="${x.toFixed(2)}" y="0" width="${wpx.toFixed(2)}" height="${h}"/>`);
    x += wpx;
  });
  const total = x + quiet;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total.toFixed(0)}" height="${h + 16}" viewBox="0 0 ${total.toFixed(2)} ${h + 16}" role="img" aria-label="Barcode ${esc(text)}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars.join('')}</g><text x="${(total / 2).toFixed(2)}" y="${h + 13}" font-family="monospace" font-size="11" text-anchor="middle">${esc(opts.caption ?? text)}</text></svg>`;
};

const h = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** HTML for a sheet of labels, ready for printDocument(). */
export const labelSheetHtml = (title: string, labels: { code: string; line1: string; line2?: string }[], printer?: string) =>
  `<h1>${h(title)}</h1><p class="muted">${labels.length} labels${printer ? ` · printer: ${h(printer)}` : ''}</p>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">${labels
    .map(
      (l) => `<div style="border:1px dashed #999;padding:8px;text-align:center;break-inside:avoid"><b>${h(l.line1)}</b>${l.line2 ? `<div class="muted" style="font-size:11px">${h(l.line2)}</div>` : ''}${barcodeSvg(l.code)}</div>`
    )
    .join('')}</div>`;
