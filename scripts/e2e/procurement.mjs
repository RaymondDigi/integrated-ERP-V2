// Procurement end-to-end check: a stores request raised, approved and issued (happy path), a validation
// failure on a stock issue, and a read-only (viewer) sign-in refused. Run against the dev server:
//   npx vite --port 5203 --strictPort &   node scripts/e2e/procurement.mjs http://localhost:5203
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5203';
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const failures = [];
const passed = [];
const check = (ok, label) => (ok ? passed : failures).push(label);

const open = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`[${email}] PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) failures.push(`[${email}] CONSOLE ${m.text().slice(0, 200)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length);
  await page.evaluate(() => window.__erp.open('procurement'));
  await page.waitForSelector('.sx-side-nav');
  return { ctx, page };
};
const nav = async (page, label) => {
  await page.locator('.sx-side-nav .sx-side-item', { hasText: label }).first().click();
  await page.waitForTimeout(150);
};
const toast = async (page, re, label) => {
  const ok = await page
    .waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('.toast-container')?.textContent ?? ''), re.source, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  const text = ok ? '' : ` (toasts: "${(await page.locator('.toast-container').textContent().catch(() => '')) ?? ''}")`;
  check(ok, `${label}${text}`);
  // Clear toasts so the next expectation reads a fresh one
  await page.evaluate(() => document.querySelectorAll('.toast-container button').forEach((b) => b.click()));
  await page.waitForTimeout(100);
};
const actAs = async (page, role) => {
  await page.locator('select[aria-label="Acting as"]').selectOption(role);
  await page.waitForTimeout(100);
};

/* ---------------- Happy path: stores request → approve → pick list → issue ---------------- */
{
  const { ctx, page } = await open('admin@integrated.local');
  await nav(page, 'Stores requests');
  check(await page.locator('h1', { hasText: 'Stores requests' }).isVisible(), 'stores requests page opens');
  await actAs(page, 'OFFICER');
  await page.getByRole('button', { name: 'Request from stores' }).first().click();
  const modal = page.locator('.sx-modal');
  await modal.locator('input[placeholder="Name"]').fill('E2E Blending supervisor');
  await modal.locator('select[aria-label="Item"]').selectOption('PKG-BOX');
  await modal.locator('input[aria-label="Quantity"]').fill('5');
  await modal.getByRole('button', { name: 'Submit request' }).click();
  await toast(page, /Stores request raised/, 'stores request raised');
  const drawer = page.locator('.sx-drawer');
  const number = ((await drawer.locator('h2').textContent()) ?? '').replace('Stores request ', '').trim();
  check(/^SR-\d{4}-\d{4}$/.test(number), `request numbered (${number})`);

  // The officer cannot approve; the manager can
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  await toast(page, /approved by the Commercial Manager/, 'officer refused approval (segregation)');
  await actAs(page, 'MANAGER');
  await drawer.getByRole('button', { name: 'Approve', exact: true }).click();
  await toast(page, /Approved/, 'manager approved');
  check(await drawer.getByText('Pick list (earliest expiry first)').isVisible(), 'pick list generated on approval');

  await actAs(page, 'STOREKEEPER');
  await drawer.getByRole('button', { name: 'Fill outstanding' }).click();
  await drawer.getByRole('button', { name: 'Issue', exact: true }).click();
  await toast(page, /Issued/, 'storekeeper issued the goods');
  check(await drawer.locator('.sx-pill, [class*="pill"]').first().textContent().then((t) => /Issued/i.test(t ?? '')).catch(() => false), 'request shows Issued');
  await page.keyboard.press('Escape');

  /* ---------------- Validation failure: issue without a quantity ---------------- */
  await nav(page, 'Inventory control');
  await page.getByRole('button', { name: 'Issue stock' }).first().click();
  await page.locator('.sx-modal').getByRole('button', { name: 'Issue', exact: true }).click();
  await toast(page, /Enter the quantity to issue/, 'issue without quantity rejected');
  await page.keyboard.press('Escape');

  /* ---------------- Movement recorded and other screens render ---------------- */
  await page.getByRole('tab', { name: /Movements/ }).click();
  check(await page.getByText(`${number} for E2E Blending supervisor`).first().isVisible().catch(() => false), 'goods issue movement recorded');
  for (const [label, heading] of [['Reports & analytics', 'Procurement reports'], ['Plan & budget', 'Procurement plan'], ['Sourcing events', 'Sourcing'], ['Invoice matching', 'Invoice matching'], ['Settings', 'Procurement settings']]) {
    await nav(page, label);
    check(await page.locator('h1').first().textContent().then((t) => (t ?? '').includes(heading)).catch(() => false), `${label} renders`);
  }
  await ctx.close();
}

/* ---------------- Permission failure: viewer account is read-only ---------------- */
{
  const { ctx, page } = await open('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await nav(page, 'Stores requests');
  check(await page.getByText('Read-only account').first().isVisible().catch(() => false), 'viewer sees read-only notice');
  await page.getByRole('button', { name: 'Request from stores' }).first().click();
  const modal = page.locator('.sx-modal');
  await modal.locator('input[placeholder="Name"]').fill('Viewer attempt');
  await modal.locator('select[aria-label="Item"]').selectOption('PKG-BOX');
  await modal.locator('input[aria-label="Quantity"]').fill('1');
  await modal.getByRole('button', { name: 'Submit request' }).click();
  await toast(page, /read-only account/, 'viewer refused (read-only account)');
  await ctx.close();
}

await browser.close();
console.log(`passed=${passed.length} failed=${failures.length}`);
for (const p of passed) console.log(`  ok  ${p}`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
