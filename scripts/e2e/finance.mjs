// Finance end-to-end check: happy path (new account, invoice with a tax code, budget line, new screens),
// validation failures (missing customer, duplicate account) and the read-only Viewer guard. Run against the dev server:
//   npx vite --port 5201 --strictPort &   node scripts/e2e/finance.mjs http://localhost:5201
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5199';
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const failures = [];
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
};

const session = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(`CONSOLE ${m.text().slice(0, 200)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length);
  await page.evaluate(() => window.__erp.open('finance'));
  await page.waitForSelector('.sx-side-item');
  return { ctx, page, errors };
};
const nav = async (page, label) => {
  await page.locator('.sx-side-item', { hasText: label }).first().click();
  await page.waitForTimeout(150);
};
/** Waits for a toast of this type containing the text. */
const toast = (page, type, text) =>
  page
    .locator(`.toast.${type}`, { hasText: text })
    .first()
    .waitFor({ timeout: 3000 })
    .then(() => true)
    .catch(() => false);

/* ---------------- Writer account (admin) ---------------- */
{
  const { ctx, page, errors } = await session('admin@integrated.local');
  check('finance overview renders', await page.getByRole('heading', { name: 'Finance overview' }).isVisible());

  // Chart of accounts: the Finance Manager adds an account
  await page.getByLabel('Acting as').selectOption('MANAGER');
  await nav(page, 'Chart of accounts');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.locator('.sx-modal input[name="code"]').fill('6995');
  await page.locator('.sx-modal input[name="name"]').fill('E2E sundry expense');
  await page.locator('.sx-modal input[name="group"]').fill('Other expenses');
  await page.getByTestId('prompt-submit').click();
  check('account added', await toast(page, 'success', 'Account added'));
  check('new account listed', await page.locator('td.sx-mono', { hasText: '6995' }).first().isVisible());

  // Validation: the same code twice is refused and the form stays open
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.locator('.sx-modal input[name="code"]').fill('6995');
  await page.locator('.sx-modal input[name="name"]').fill('Duplicate');
  await page.getByTestId('prompt-submit').click();
  check('duplicate account refused', await toast(page, 'error', 'already exists'));
  check('form stays open after an error', await page.getByTestId('prompt-submit').isVisible());
  await page.locator('.sx-modal').getByRole('button', { name: 'Cancel' }).click();

  // Sales invoice: validation then the happy path with a tax code and a cost centre
  await page.getByLabel('Acting as').selectOption('ACCOUNTANT');
  await nav(page, 'Sales invoices');
  await page.getByRole('button', { name: /New invoice/ }).click();
  await page.getByRole('button', { name: 'Save draft' }).click();
  check('invoice without a customer refused', await toast(page, 'error', 'Choose a customer'));
  const modal = page.locator('.sx-modal').last();
  const customer = modal.locator('select').first();
  const firstCustomer = await customer.locator('option').nth(1).getAttribute('value');
  await customer.selectOption(firstCustomer);
  await modal.getByLabel('Description').first().fill('E2E consulting');
  await modal.getByLabel('Unit price').first().fill('1000');
  await modal.getByLabel('Tax code').first().selectOption('V16');
  const cc = await modal.getByLabel('Cost centre').first().locator('option').nth(1).getAttribute('value');
  await modal.getByLabel('Cost centre').first().selectOption(cc);
  check('total includes 16% VAT', ((await modal.locator('.sx-totals-grand').textContent()) ?? '').includes('1,160'));
  await page.getByRole('button', { name: 'Save & submit' }).click();
  check('invoice created', await toast(page, 'success', 'Invoice created'));
  // The new invoice opens in the drawer with the document actions (hold, e-invoice, write-off…)
  check('document actions shown', await page.getByTestId('doc-actions').isVisible().catch(() => false));
  while (await page.locator('.sx-overlay').count()) await page.locator('.sx-overlay [aria-label="Close"]').last().click();

  // Budgets: a new line spread over the year
  await page.getByLabel('Acting as').selectOption('MANAGER');
  await nav(page, 'Budgets');
  await page.getByRole('button', { name: /Budget line/ }).click();
  await page.locator('.sx-modal select[name="account"]').selectOption('6995');
  await page.locator('.sx-modal input[name="annual"]').fill('120000');
  await page.getByTestId('prompt-submit').click();
  check('budget line spread', await toast(page, 'success', 'Budget saved'));

  // New screens open without errors
  for (const label of ['Credit & debit memos', 'Credit & collections', 'Payment runs', 'Treasury', 'Tax', 'Report library', 'Report writer', 'Finance setup']) {
    const item = page.locator('.sx-side-item', { hasText: label }).first();
    if (!(await item.count())) {
      check(`screen ${label}`, false, 'not in the sidebar');
      continue;
    }
    await item.click();
    await page.waitForTimeout(120);
    check(`screen ${label}`, (await page.locator('#root').innerHTML()).length > 500);
  }
  check('no console errors (writer)', !errors.length, errors.join(' | '));
  await ctx.close();
}

/* ---------------- Viewer account (read only) ---------------- */
{
  const { ctx, page, errors } = await session('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await page.getByLabel('Acting as').selectOption('DIRECTOR');
  await nav(page, 'Chart of accounts');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.locator('.sx-modal input[name="code"]').fill('6996');
  await page.locator('.sx-modal input[name="name"]').fill('Viewer attempt');
  await page.getByTestId('prompt-submit').click();
  check('viewer cannot change the chart', await toast(page, 'error', 'read-only account'));
  await page.locator('.sx-modal').getByRole('button', { name: 'Cancel' }).click();
  check('viewer account not saved', !(await page.locator('td.sx-mono', { hasText: '6996' }).count()));
  check('no console errors (viewer)', !errors.length, errors.join(' | '));
  await ctx.close();
}

await browser.close();
console.log(`passed=${passed} failed=${failures.length}`);
process.exit(failures.length ? 1 : 0);
