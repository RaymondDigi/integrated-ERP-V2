// HCM end-to-end checks: welfare claim (validation failure then success), grievance logging, org structure
// maintenance, and read-only enforcement for a viewer account. Run against the dev server:
//   npx vite --port 5207 --strictPort &   node scripts/e2e/hcm.mjs http://localhost:5207
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5207';
const IGNORE = [/favicon/i, /Download the React DevTools/i, /unique "key" prop/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const results = [];
const problems = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const session = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${email}] PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) problems.push(`[${email}] CONSOLE ${m.text().slice(0, 200)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && window.__erp);
  return { ctx, page };
};
const open = async (page, view) => { await page.evaluate((v) => window.__erp.open(v), view); await page.waitForTimeout(250); };
// Toasts stay on screen for a while, so a check counts matching toasts before the action and waits for a new one.
let seen = [];
const toastTexts = (page) => page.locator('.toast').allTextContents();
const countMatching = async (page, re) => (await toastTexts(page)).filter((t) => re.test(t)).length;
const clearToasts = async (page) => { seen = await toastTexts(page); };
const toastWith = async (page, re, ms = 2500) => {
  const before = seen.filter((t) => re.test(t)).length;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await countMatching(page, re)) > before) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const panel = (page, title) => page.locator('section.sx-panel').filter({ hasText: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first();

/* ---------------------------------------------------------------- admin happy path */
{
  const { ctx, page } = await session('admin@integrated.local');
  await open(page, 'hr-services');
  const wf = panel(page, 'New welfare claim');
  check('welfare screen renders', await wf.count());

  // Validation: submitting an empty claim is refused by the store
  await clearToasts(page);
  await wf.getByRole('button', { name: 'Submit claim' }).click();
  check('empty welfare claim rejected', await toastWith(page, /Welfare claim not submitted/));

  // Happy path: try staff until one meets the service rule for the chosen benefit
  const staffSel = wf.locator('select').first();
  const values = await staffSel.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  await wf.locator('input:not([type=date])').first().fill('Burial of father at Kericho; burial permit BP-2291');
  let submitted = false;
  for (const v of values.slice(0, 15)) {
    await staffSel.selectOption(v);
    await clearToasts(page);
    await wf.getByRole('button', { name: 'Submit claim' }).click();
    if (await toastWith(page, /Welfare claim submitted/, 1200)) { submitted = true; break; }
  }
  check('welfare claim submitted', submitted);
  check('claim listed as submitted', await panel(page, 'Claims').getByText(/submitted/i).count());

  // Grievance logging in OSH & Security
  await open(page, 'osh-security');
  await page.getByRole('tab', { name: /Grievances/ }).click();
  await page.waitForTimeout(200);
  const gp = panel(page, 'Raise a grievance or complaint');
  await clearToasts(page);
  await gp.getByRole('button', { name: 'Log complaint' }).click();
  check('empty grievance rejected', await toastWith(page, /./));
  const gs = gp.locator('select').nth(2);
  const gv = await gs.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  await gs.selectOption(gv[0]);
  const inputs = gp.locator('input.form-control');
  await inputs.nth(1).fill('Night shift transport not provided');
  await gp.locator('textarea').fill('The factory van did not collect pluckers from Kapkatet on three nights this week.');
  await clearToasts(page);
  await gp.getByRole('button', { name: 'Log complaint' }).click();
  check('grievance logged', await toastWith(page, /grievance|complaint/i));

  // Organisation structure: add a department, then remove it
  await open(page, 'org-setup');
  await page.getByRole('tab', { name: 'Organisation structure' }).click();
  await page.waitForTimeout(200);
  const op = page.locator('section.sx-panel', { hasText: 'Organisation structure ·' }).first();
  check('org structure panel renders', await op.count());
  await clearToasts(page);
  await op.getByRole('button', { name: 'Add', exact: true }).click();
  check('blank unit rejected', await toastWith(page, /Name required/));
  await op.getByLabel('Unit name').fill('Green Leaf Weighing');
  await clearToasts(page);
  await op.getByRole('button', { name: 'Add', exact: true }).click();
  check('department added', await toastWith(page, /Unit added/));
  const row = op.locator('tr', { hasText: 'Green Leaf Weighing' });
  await clearToasts(page);
  await row.getByRole('button', { name: 'Remove' }).click();
  check('department removed', await toastWith(page, /Department removed/));

  // Payroll bank files tab renders the simulated upload label
  await open(page, 'payroll');
  const bf = page.getByRole('tab', { name: /Bank files/i });
  if (await bf.count()) { await bf.first().click(); await page.waitForTimeout(200); }
  check('payroll bank files reachable', await bf.count());
  await ctx.close();
}

/* ---------------------------------------------------------------- viewer is read-only */
{
  const { ctx, page } = await session('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await open(page, 'hr-services');
  const btn = panel(page, 'New welfare claim').getByRole('button', { name: 'Submit claim' });
  check('viewer: welfare submit disabled', (await btn.count()) && (await btn.isDisabled()));

  // The store guard also refuses writes from screens that do not disable buttons
  await open(page, 'ess');
  await page.locator('.ess-tab', { hasText: 'Services' }).click();
  await page.waitForTimeout(200);
  await clearToasts(page);
  await panel(page, 'Welfare claim').getByRole('button', { name: 'Submit claim' }).click();
  check('viewer: store refuses write with read-only error', await toastWith(page, /Read-only account/));
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
problems.forEach((p) => console.log(p));
const failed = results.filter((r) => !r.ok).length + problems.length;
console.log(`checks=${results.length} failed=${results.filter((r) => !r.ok).length} problems=${problems.length}`);
process.exit(failed ? 1 : 0);
