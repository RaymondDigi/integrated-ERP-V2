import React from 'react';

/**
 * Code 39 barcode as inline SVG (no library). Readable by any keyboard-wedge scanner; RFID readers send the tag ID
 * the same way, so scan boxes accept either.
 */
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn', '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
  $: 'nwnwnwnnn', '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn'
};

export const code39Bars = (value: string) => {
  const text = `*${value.toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '-')}*`;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of text) {
    const p = CODE39[ch];
    for (let i = 0; i < 9; i++) {
      const w = p[i] === 'w' ? 3 : 1;
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
    x += 1;
  }
  return { bars, width: x };
};

export const Barcode: React.FC<{ value: string; height?: number; caption?: boolean }> = ({ value, height = 44, caption = true }) => {
  const { bars, width } = code39Bars(value);
  return (
    <svg viewBox={`0 0 ${width} ${height + (caption ? 12 : 0)}`} width={Math.min(320, width * 1.6)} role="img" aria-label={`Barcode ${value}`} style={{ background: '#fff', padding: 4 }}>
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
      {caption && (
        <text x={width / 2} y={height + 10} fontSize="9" textAnchor="middle" fontFamily="monospace" fill="#000">
          {value}
        </text>
      )}
    </svg>
  );
};

/** Printable label sheet HTML with one barcode per item. */
export const labelSheetHtml = (items: { code: string; title: string; detail?: string }[]) =>
  `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px">${items
    .map((i) => {
      const { bars, width } = code39Bars(i.code);
      const svg = `<svg viewBox="0 0 ${width} 56" width="300" xmlns="http://www.w3.org/2000/svg">${bars.map((b) => `<rect x="${b.x}" y="0" width="${b.w}" height="44" fill="#000"/>`).join('')}<text x="${width / 2}" y="54" font-size="9" text-anchor="middle" font-family="monospace">${i.code}</text></svg>`;
      return `<div style="border:1px dashed #999;padding:10px"><b>${i.title}</b><br><small>${i.detail ?? ''}</small><br>${svg}</div>`;
    })
    .join('')}</div>`;
