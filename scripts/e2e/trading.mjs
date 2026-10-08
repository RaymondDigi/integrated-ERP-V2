// End-to-end check of the Trading & Business Development additions: a web order through the simulated
// customer portal, the invoice run, pricing and onboarding validation, customer feedback, and the
// read-only viewer refusal. Run against the dev server:
//   npx vite --port 5202 --strictPort &   node scripts/e2e/trading.mjs http://localhost:5202
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5202';
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const problems = [];
const passed = [];

const session = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${email}] PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) problems.push(`[${email}] CONSOLE ${m.text().slice(0, 300)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length);
  return { ctx, page };
};
const open = async (page, view) => {
  await page.evaluate((v) => window.__erp.open(v), view);
  await page.waitForTimeout(250);
};
const nav = async (page, label) => {
  await page.locator('.sx-side-nav .sx-side-item', { hasText: label }).first().click();
  await page.waitForTimeout(200);
};
const tab = async (page, label) => {
  await page.locator('#main-content [role="tab"], main [role="tab"]', { hasText: label }).first().click();
  await page.waitForTimeout(150);
};
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.toast .btn-ghost').forEach((b) => b.click()));
/** Waits for a toast containing the text; records pass or failure under the step name. */
const expectToast = async (page, text, step) => {
  try {
    await page.locator('.toast', { hasText: text }).first().waitFor({ timeout: 4000 });
    passed.push(step);
  } catch {
    const seen = await page.locator('.toast').allTextContents().catch(() => []);
    problems.push(`${step}: expected a message containing "${text}", saw ${JSON.stringify(seen)}`);
  }
  await clearToasts(page);
};
const expectText = async (locator, text, step) => {
  try {
    await locator.filter({ hasText: text }).first().waitFor({ timeout: 4000 });
    passed.push(step);
  } catch {
    problems.push(`${step}: "${text}" not found`);
  }
};

/* ---------------- Happy path and validation as an administrator ---------------- */
{
  const { ctx, page } = await session('admin@integrated.local');
  await open(page, 'trading');

  // Customer portal (simulated): basket → checkout validation → web order
  await nav(page, 'Customer portal');
  await expectText(page.locator('.tr-sim'), 'Simulated portal', 'portal is labelled as simulated');
  await tab(page, 'Catalogue');
  await page.locator('.tr-card button', { hasText: 'Add' }).first().click();
  await tab(page, 'Basket');
  await page.locator('button', { hasText: 'Place order' }).click();
  await expectToast(page, 'Enter your order reference', 'checkout refuses an order without a reference');
  await page.getByLabel(/Your order reference/).fill('E2E-WEB-001');
  await page.locator('button', { hasText: 'Place order' }).click();
  await expectToast(page, 'Sales order created', 'web order placed through the portal');
  await tab(page, 'My orders');
  await expectText(page.locator('#main-content li'), 'E2E-WEB-001', 'web order shows in the customer’s order list');

  // Duplicate customer reference is refused
  await tab(page, 'Catalogue');
  await page.locator('.tr-card button', { hasText: 'Add' }).first().click();
  await tab(page, 'Basket');
  await page.getByLabel(/Your order reference/).fill('E2E-WEB-001');
  await page.locator('button', { hasText: 'Place order' }).click();
  await expectToast(page, 'already used reference', 'duplicate portal order reference refused');

  // The web order reaches the back office
  await nav(page, 'Sales orders');
  await page.locator('.sx-search input').fill('E2E-WEB-001');
  await page.waitForTimeout(200);
  await expectText(page.locator('#main-content tr'), 'WEB', 'web order listed in Sales orders with its channel');

  // Order drawer with its extras (hold, charges, releases, direct ship, payment, notes)
  await page.locator('#main-content tbody tr').first().click();
  await expectText(page.locator('.sx-drawer'), 'Charges', 'order drawer shows charges and order extras');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Customer master drawer, every tab
  await nav(page, 'Customers');
  await page.locator('#main-content tbody tr').first().click();
  for (const t of ['Credit & terms', 'Addresses & contacts', 'KYC', 'Documents & codes', 'Regulatory', '360° view']) {
    await page.locator('.sx-drawer [role="tab"]', { hasText: t }).click();
    await page.waitForTimeout(80);
  }
  await expectText(page.locator('.sx-drawer .tr-journey span'), 'First order', 'customer 360 view renders the journey');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Pricing validation and the simulator
  await nav(page, 'Pricing');
  await page.locator('button', { hasText: 'New price list' }).click();
  await page.locator('button', { hasText: 'Save price list' }).click();
  await expectToast(page, 'Name the price list', 'price list without a name is refused');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // Invoice run raises an invoice in Finance for delivered orders
  await nav(page, 'Invoice run');
  const boxes = page.locator('#main-content input[type="checkbox"]');
  if ((await boxes.count()) > 0) {
    await boxes.first().check();
    await page.locator('button', { hasText: /Raise 1 invoice/ }).click();
    await expectToast(page, 'Invoice raised in Finance', 'invoice run raises a Finance invoice');
  } else problems.push('invoice run: no delivered orders waiting in the demo data');

  // Returns, auctions and reports render with their seeded data
  await nav(page, 'Returns & credits');
  await expectText(page.locator('#main-content td'), 'RMA', 'returns list shows the seeded RMA');
  await nav(page, 'Auctions & tasting');
  await expectText(page.locator('#main-content td'), 'SALE', 'auction sales listed');
  await nav(page, 'Sales reports');
  await tab(page, 'MTD / YTD / R12');
  await expectText(page.locator('#main-content th'), 'Rolling 12 months', 'period report renders');

  // Business development: onboarding validation and customer feedback
  await open(page, 'bizdev');
  await nav(page, 'Onboarding');
  await page.locator('button', { hasText: 'New application' }).click();
  await page.getByLabel(/^Company/).fill('Kilima Tea Packers Ltd');
  await page.getByLabel(/^KRA PIN/).fill('BADPIN');
  await page.getByLabel(/^Contact person/).fill('Wanjiku Kamau');
  await page.getByLabel(/^Email/).fill('wanjiku@kilima.co.ke');
  await page.locator('button', { hasText: 'Submit application' }).click();
  await expectToast(page, 'KRA PIN must look like', 'onboarding refuses an invalid KRA PIN');
  await page.getByLabel(/^KRA PIN/).fill('P051998877Q');
  await page.locator('button', { hasText: 'Submit application' }).click();
  await expectToast(page, 'Application received', 'onboarding application captured');
  await page.keyboard.press('Escape');

  await nav(page, 'Customer experience');
  await page.locator('#main-content select.form-control').first().selectOption({ index: 1 });
  await page.getByPlaceholder('What did the customer say?').fill('Two cartons arrived crushed at the Mombasa depot');
  await page.locator('button', { hasText: 'Log' }).first().click();
  await expectToast(page, 'Feedback logged', 'complaint logged with an SLA');

  await ctx.close();
}

/* ---------------- Read-only viewer is refused ---------------- */
{
  const { ctx, page } = await session('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await open(page, 'trading');
  await nav(page, 'Customer portal');
  await tab(page, 'Catalogue');
  await page.locator('.tr-card button', { hasText: 'Add' }).first().click();
  await tab(page, 'Basket');
  await page.getByLabel(/Your order reference/).fill('VIEWER-1');
  await page.locator('button', { hasText: 'Place order' }).click();
  await expectToast(page, 'read-only', 'viewer cannot place an order');
  await nav(page, 'Pricing');
  await page.locator('button', { hasText: 'New price list' }).click();
  await page.locator('button', { hasText: 'Save price list' }).click();
  await expectToast(page, 'read-only', 'viewer cannot save a price list');
  await ctx.close();
}

await browser.close();
console.log(`passed=${passed.length} problems=${problems.length}`);
for (const p of passed) console.log(`  ok  ${p}`);
for (const p of new Set(problems)) console.log(`  FAIL ${p}`);
process.exit(problems.length ? 1 : 0);
