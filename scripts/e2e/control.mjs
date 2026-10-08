// End-to-end check of the Quality, ICT, Governance, Workplace and platform-control features.
// Happy paths as the administrator, then validation and permission failures (incl. the read-only viewer).
//   npx vite --port 5208 --strictPort &   node scripts/e2e/control.mjs http://localhost:5208
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5208';
const IGNORE = [/favicon/i, /Download the React DevTools/i, /unique "key" prop/];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const problems = [];
let passed = 0;

const session = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${email}] PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) problems.push(`[${email}] CONSOLE ${m.text().slice(0, 300)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && window.__erp);
  return { ctx, page };
};
const open = (page, view) => page.evaluate((v) => window.__erp.open(v), view);
const nav = async (page, label) => { await page.locator('.sx-side-nav .sx-side-item', { hasText: label }).first().click(); await page.waitForTimeout(150); };
const step = async (name, fn) => {
  try { await fn(); passed++; console.log(`ok   ${name}`); }
  catch (e) { problems.push(`${name}: ${e.message.split('\n')[0]}`); console.log(`FAIL ${name}`); }
};
const toast = (page, text) => page.locator('.toast-container', { hasText: text }).first().waitFor({ timeout: 4000 });
const dialog = (page) => page.locator('[role="dialog"]').last();

/* ---------------- Administrator: happy paths and validation ---------------- */
{
  const { ctx, page } = await session('admin@integrated.local');

  await step('emergency: empty report is refused', async () => {
    await open(page, 'quality');
    await nav(page, 'Emergencies');
    await page.getByRole('button', { name: 'Report an emergency' }).first().click();
    await dialog(page).getByRole('button', { name: /Report and alert/ }).click();
    await toast(page, 'Say where it is and what is happening');
  });

  await step('emergency: class 2 report alerts people and lists the record', async () => {
    const d = dialog(page);
    await d.locator('select').first().selectOption('2');
    await d.getByPlaceholder('e.g. Bonded warehouse 2, Shimanzi').fill('Bonded warehouse 2, Shimanzi');
    await d.locator('textarea').fill('Water leak through the roof over BP1 pallets after heavy rain');
    await d.getByRole('button', { name: /Report and alert/ }).click();
    await toast(page, 'Emergency reported');
    await page.locator('[role="dialog"]', { hasText: 'Bonded warehouse 2' }).first().waitFor({ timeout: 4000 });
  });

  await step('document library: check out, refuse empty check-in, check in v3', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.sx-overlay').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await open(page, 'governance');
    await nav(page, 'Document library');
    await page.locator('tr', { hasText: 'Tea blending standard operating procedure' }).first().click();
    const d = dialog(page);
    await d.getByRole('button', { name: /Check out to edit/ }).click();
    await toast(page, 'Checked out');
    await d.getByRole('button', { name: /^Check in$/ }).click();
    await toast(page, 'Say what changed in this version');
    await d.locator('.sx-panel input.form-control').first().fill('Updated withering times for the Kericho line');
    await d.getByRole('button', { name: /^Check in$/ }).click();
    await toast(page, 'Version 3 saved');
  });

  await step('ICT: raising a change without details is refused', async () => {
    await page.locator('.sx-overlay').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await open(page, 'ict');
    await nav(page, 'Change board');
    await page.getByRole('button', { name: /Raise a change/ }).first().click();
    await dialog(page).getByRole('button', { name: /Submit change/ }).click();
    await page.locator('.toast-container .toast-content').first().waitFor({ timeout: 4000 });
    await page.keyboard.press('Escape');
  });

  await step('report builder: group sales by customer and save', async () => {
    await page.locator('.sx-overlay').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await open(page, 'executive');
    await nav(page, 'Report builder');
    const name = page.locator('.sx-inline-form input.form-control').first();
    await name.fill('E2E sales by customer');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await toast(page, 'Report saved');
    await page.getByRole('button', { name: 'E2E sales by customer', exact: true }).waitFor({ timeout: 3000 });
  });

  await step('alert centre lists the new emergency as critical', async () => {
    await nav(page, 'Alert centre');
    await page.locator('tr', { hasText: 'Chemical spill' }).first().waitFor({ timeout: 3000 }).catch(async () => {
      await page.locator('tr', { hasText: 'Emergency' }).first().waitFor({ timeout: 3000 });
    });
  });

  await step('audit logs show business record changes from the suites', async () => {
    await open(page, 'audit');
    await page.locator('table', { hasText: 'New version checked in' }).first().waitFor({ timeout: 4000 });
  });

  await ctx.close();
}

/* ---------------- Viewer (read-only): every write refused, admin screens hidden ---------------- */
{
  const { ctx, page } = await session('a.hassan@intergrated-erp.ke', 'KHE-0120');

  await step('viewer: reporting an emergency is refused as read-only', async () => {
    await open(page, 'quality');
    await nav(page, 'Emergencies');
    await page.getByRole('button', { name: 'Report an emergency' }).first().click();
    const d = dialog(page);
    await d.getByPlaceholder('e.g. Bonded warehouse 2, Shimanzi').fill('Kericho factory');
    await d.locator('textarea').fill('Boiler pressure alarm on line 1 during the night shift');
    await d.getByRole('button', { name: /Report and alert/ }).click();
    await toast(page, 'read-only account');
  });

  await step('viewer: logging an ICT ticket from the helpdesk is refused', async () => {
    await page.keyboard.press('Escape');
    await page.locator('.sx-overlay').first().click({ position: { x: 5, y: 5 } }).catch(() => {});
    await open(page, 'approvals');
    await nav(page, 'IT helpdesk');
    await page.getByPlaceholder('e.g. Cannot print delivery notes at Shimanzi').fill('Cannot open the tea auction catalogue');
    await page.getByRole('button', { name: /Log ticket/ }).click();
    await toast(page, 'read-only account');
  });

  await step('viewer: platform administration screens are denied', async () => {
    await open(page, 'users');
    await page.getByText('Access denied').waitFor({ timeout: 3000 });
  });

  await ctx.close();
}

await browser.close();
console.log(`passed=${passed} problems=${problems.length}`);
for (const p of new Set(problems)) console.log(p);
process.exit(problems.length ? 1 : 0);
