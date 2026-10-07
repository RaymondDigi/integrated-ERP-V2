/**
 * A small, safe formula language for pay items: numbers, named values (BASIC, QTY…), + − × ÷,
 * brackets and the functions MIN, MAX, ROUND, FLOOR, CEIL, IF(cond, a, b) with comparisons.
 * Parsed by hand — nothing is ever passed to eval.
 */

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

const tokenize = (src: string): Tok[] => {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const n = Number(src.slice(i, j).replace(/_/g, ''));
      if (Number.isNaN(n)) throw new Error(`Bad number "${src.slice(i, j)}"`);
      out.push({ t: 'num', v: n });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['>=', '<=', '==', '!='].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/(),<>%'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
};

const FUNCS: Record<string, (a: number[]) => number> = {
  MIN: (a) => Math.min(...a),
  MAX: (a) => Math.max(...a),
  ROUND: (a) => (a.length > 1 ? Math.round(a[0] / a[1]) * a[1] : Math.round(a[0])),
  FLOOR: (a) => Math.floor(a[0]),
  CEIL: (a) => Math.ceil(a[0]),
  IF: (a) => (a[0] ? a[1] : a[2] ?? 0)
};

/** Evaluates a formula against named values. Throws with a plain message when the formula is wrong. */
export const evalFormula = (src: string, vars: Record<string, number>): number => {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === 'op' && peek().v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`);
    p++;
  };
  const primary = (): number => {
    const t = peek();
    if (!t) throw new Error('Formula ends too early');
    if (t.t === 'num') {
      p++;
      if (isOp('%')) {
        p++;
        return t.v / 100;
      }
      return t.v;
    }
    if (t.t === 'id') {
      p++;
      if (isOp('(')) {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function ${t.v}`);
        p++;
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(compare());
          while (isOp(',')) {
            p++;
            args.push(compare());
          }
        }
        expect(')');
        return fn(args);
      }
      if (!(t.v in vars)) throw new Error(`Unknown value ${t.v}`);
      return vars[t.v];
    }
    if (t.v === '(') {
      p++;
      const v = compare();
      expect(')');
      return v;
    }
    if (t.v === '-') {
      p++;
      return -primary();
    }
    throw new Error(`Unexpected "${t.v}"`);
  };
  const term = (): number => {
    let v = primary();
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v;
      const r = primary();
      if (op === '/' && r === 0) throw new Error('Division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = term();
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const compare = (): number => {
    const v = sum();
    const t = peek();
    if (t?.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) {
      p++;
      const r = sum();
      return { '<': v < r, '>': v > r, '<=': v <= r, '>=': v >= r, '==': v === r, '!=': v !== r }[t.v as '<'] ? 1 : 0;
    }
    return v;
  };
  if (!toks.length) throw new Error('Formula is empty');
  const v = compare();
  if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as { v: string | number }).v}"`);
  if (!Number.isFinite(v)) throw new Error('Result is not a number');
  return v;
};

/** Named values a pay item formula can use, with what each means. */
export const FORMULA_VARS: { name: string; about: string }[] = [
  { name: 'BASIC', about: 'Monthly basic salary (contract)' },
  { name: 'HOUSE', about: 'House allowance' },
  { name: 'TRANSPORT', about: 'Transport allowance' },
  { name: 'PENSIONABLE', about: 'Basic + house + transport' },
  { name: 'DAILY', about: 'Day rate: pensionable pay ÷ 30 (or the daily wage)' },
  { name: 'HOURLY', about: 'Hour rate: basic ÷ 225' },
  { name: 'QTY', about: 'Quantity entered when posting (hours, days, units, nights)' },
  { name: 'YEARS', about: 'Completed years of service' },
  { name: 'DAYS', about: 'Days paid this month (out of 30)' }
];

/** Returns an error message, or '' if the formula works with sample values. */
export const checkFormula = (src: string) => {
  try {
    evalFormula(src, Object.fromEntries(FORMULA_VARS.map((v) => [v.name, 1000])));
    return '';
  } catch (e) {
    return (e as Error).message;
  }
};
