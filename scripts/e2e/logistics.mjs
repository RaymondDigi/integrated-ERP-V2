// Logistics end-to-end: drives the shipping-instruction happy path (confirm stock → reserve lots → book the
// shipment → pull an external milestone → see it in the reports) and checks two refusals: a validation error on
// an empty instruction and the read-only viewer being refused. Run against the dev server:
//   npx vite --port 5206 --strictPort &   node scripts/e2e/logistics.mjs http://localhost:5206
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5206';
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const failures = [];
const passes = [];
const check = (cond, msg) => (cond ? passes.push(msg) : failures.push(msg));

const signIn = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { failures.push(`[${email}] PAGEERROR ${e.message}`); if (process.env.DEBUG) console.log('PAGEERROR', e.stack); });
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) failures.push(`[${email}] CONSOLE ${m.text().slice(0, 300)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length);
  return { ctx, page };
};
const open = async (page, view) => {
  await page.evaluate((v) => window.__erp.open(v), view);
  await page.waitForTimeout(200);
};
const nav = async (page, label) => {
  await page.locator('.sx-side-nav .sx-side-item', { hasText: label }).first().click();
  await page.waitForTimeout(150);
};
const persona = async (page, role) => {
  await page.locator('.sx-actor select').selectOption(role);
  await page.waitForTimeout(100);
};
// Waits for a toast matching the pattern (toasts are never removed by hand — React owns that DOM)
const toast = async (page, re) => {
  const t = page.locator('.toast', { hasText: re }).first();
  const ok = await t.waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
  return { ok, text: ok ? ((await t.textContent()) ?? '').replace(/\s+/g, ' ').slice(0, 140) : (await page.locator('.toast').allTextContents()).join(' | ').slice(0, 200) };
};

/* ---------------- Happy path: officer confirms and books an SI ---------------- */
{
  const { ctx, page } = await signIn('admin@integrated.local');
  await open(page, 'shipping');
  await persona(page, 'OFFICER');
  await nav(page, 'Shipping instructions');
  const row = page.locator('tr', { hasText: /SI-\d{4}-0002/ }).first();
  check(await row.isVisible(), 'SI-0002 is listed in Shipping instructions');
  await row.click();
  await page.locator('button', { hasText: 'Confirm stock & reserve' }).click();
  let t = await toast(page, /Instruction confirmed/);
  check(t.ok, `confirm SI → "${t.text}"`);
  await page.locator('button', { hasText: 'Book shipment' }).click();
  t = await toast(page, /Shipment booked/);
  check(t.ok, `book shipment → "${t.text}"`);
  const drawer = page.locator('.sx-drawer, [role="dialog"]').first();
  const drawerText = (await drawer.textContent({ timeout: 3000 }).catch(() => '')) ?? '';
  check(/SHP-\d{4}-\d{4}/.test(drawerText), 'drawer shows the booked shipment number');

  // Reserved tea now shows against the SI in Warehousing › Tea lots
  await open(page, 'warehousing');
  await nav(page, 'Tea lots');
  const lotsText = (await page.locator('main, #main-content').first().textContent()) ?? '';
  check(/Tea in stock/.test(lotsText), 'Tea lots page renders');

  // External milestone pulled through the simulated KEPHIS connector
  await open(page, 'shipping');
  await nav(page, 'External tracking');
  await page.locator('button', { hasText: 'Pull KEPHIS' }).first().click();
  await page.waitForTimeout(200);
  const trackText = (await page.locator('main, #main-content').first().textContent()) ?? '';
  check(/via connector/.test(trackText), 'KEPHIS milestone updated via the simulated connector');

  // Shipment register report includes the new shipment
  await nav(page, 'Reports');
  const repText = (await page.locator('main, #main-content').first().textContent()) ?? '';
  check(/Shipment register/.test(repText) && /SHP-\d{4}-\d{4}/.test(repText), 'Shipment register lists shipments');

  // Validation failure: empty instruction is refused with a clear message
  await nav(page, 'Shipping instructions');
  await page.locator('button', { hasText: 'New instruction' }).click();
  await page.locator('button', { hasText: 'Save draft' }).click();
  t = await toast(page, /sales contract reference/i);
  check(t.ok, `empty SI refused → "${t.text}"`);
  await page.keyboard.press('Escape');

  // Permission failure: the customer-portal persona cannot confirm stock (button hidden) nor see other customers
  await persona(page, 'CUSTOMER');
  await page.waitForTimeout(150);
  await nav(page, 'My instructions');
  const portalText = (await page.locator('main, #main-content').first().textContent()) ?? '';
  check(/Customer portal/.test(portalText) && !/Kericho Packers|Mombasa Tea Blenders/.test(portalText), 'portal shows only the customer’s own instructions');
  await persona(page, 'OFFICER');

  // Smoke: open the first record's drawer on every logistics screen (the crawler only clicks menus and tabs)
  let drawers = 0;
  for (const view of ['warehousing', 'shipping']) {
    await open(page, view);
    const items = await page.locator('.sx-side-nav .sx-side-item').allTextContents();
    for (const label of items) {
      await page.locator('.sx-side-nav .sx-side-item', { hasText: label.trim() }).first().click().catch(() => {});
      await page.waitForTimeout(80);
      const row = page.locator('main tbody tr, #main-content tbody tr').first();
      if (await row.isVisible().catch(() => false)) {
        await row.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(120);
        const close = page.locator('.sx-drawer [aria-label="Close"], .sx-modal [aria-label="Close"]').first();
        if (await close.isVisible().catch(() => false)) {
          drawers++;
          await close.click().catch(() => {});
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
      const alive = await page.evaluate(() => (document.querySelector('#root')?.innerHTML.length ?? 0) > 200);
      if (!alive) failures.push(`${view} > ${label.trim()} BLANK SCREEN`);
    }
  }
  check(drawers >= 12, `opened ${drawers} record drawers across Warehousing and Shipping without errors`);
  await ctx.close();
}

/* ---------------- Permission failure: read-only viewer ---------------- */
{
  const { ctx, page } = await signIn('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await open(page, 'shipping');
  await nav(page, 'Shipping instructions');
  const note = (await page.locator('main, #main-content').first().textContent()) ?? '';
  check(/Read-only account/.test(note), 'viewer sees the read-only notice');
  await page.locator('button', { hasText: 'New instruction' }).click();
  await page.locator('button', { hasText: 'Save draft' }).click();
  const t = await toast(page, /read-only account/i);
  check(t.ok, `viewer save refused → "${t.text}"`);
  await ctx.close();
}

await browser.close();
for (const p of passes) console.log(`PASS ${p}`);
for (const f of failures) console.log(`FAIL ${f}`);
console.log(`passed=${passes.length} failed=${failures.length}`);
process.exit(failures.length ? 1 : 0);
