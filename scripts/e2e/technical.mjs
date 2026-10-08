// End-to-end checks for Maintenance, Projects, Transport and the container desk: drives the main happy paths
// and the guards (permit to work, KRA hold, read-only viewer). Run against the dev server:
//   npx vite --port 5205 --strictPort &   node scripts/e2e/technical.mjs http://localhost:5205
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5205';
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const results = [];
const errors = [];

const session = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${email}] PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) errors.push(`[${email}] CONSOLE ${m.text().slice(0, 300)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length && window.__erp);
  return { ctx, page };
};

const open = async (page, view) => { await page.evaluate((v) => window.__erp.open(v), view); await page.waitForTimeout(250); };
const nav = async (page, label) => { await page.locator('.sx-side-nav .sx-side-item', { hasText: label }).first().click(); await page.waitForTimeout(200); };
const actAs = async (page, role) => { await page.locator('select[aria-label="Acting as"]').selectOption(role); await page.waitForTimeout(100); };
const drawer = (page) => page.locator('.sx-drawer');
const toast = async (page, text, timeout = 3000) => {
  try {
    await page.locator('.toast', { hasText: text }).first().waitFor({ timeout });
    return true;
  } catch {
    return false;
  }
};
const check = async (name, fn) => {
  try {
    const ok = await fn();
    results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  } catch (e) {
    results.push(`FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
};

/* ---------------- Admin (can write) ---------------- */
{
  const { ctx, page } = await session('admin@integrated.local');
  await open(page, 'maintenance');

  await check('maintenance: fault report becomes a request', async () => {
    await nav(page, 'Requests & notices');
    await page.getByRole('button', { name: 'Report a fault' }).click();
    const modal = page.locator('.sx-modal');
    await modal.locator('select').first().selectOption({ index: 1 });
    await modal.locator('textarea').fill('Bearing noise on the withering fan');
    await modal.getByRole('button', { name: 'Send request' }).click();
    return toast(page, 'Request raised');
  });

  await check('maintenance: permit-required job cannot start without an active permit', async () => {
    await nav(page, 'Work orders');
    await actAs(page, 'TECHNICIAN');
    await page.locator('tr', { hasText: 'Boiler pressure relief valve test' }).first().click();
    await drawer(page).getByRole('button', { name: 'Start work' }).click();
    return toast(page, 'permit to work');
  });

  await check('maintenance: linking active permit PTW-HOT-101 lets the job start', async () => {
    await drawer(page).locator('select[aria-label="OSH permit"]').selectOption('PTW-HOT-101');
    await drawer(page).getByRole('button', { name: 'Link permit' }).click();
    await drawer(page).getByRole('button', { name: 'Start work' }).click();
    return (await toast(page, 'Work started')) && (await drawer(page).getByText('In progress').first().isVisible());
  });

  await check('maintenance: equipment register opens with history and MTBF', async () => {
    await page.keyboard.press('Escape');
    await nav(page, 'Equipment register');
    await page.locator('tr', { hasText: 'Blending drum' }).first().click();
    return (await drawer(page).getByText('MTBF').isVisible()) && (await drawer(page).getByText('Bill of materials').isVisible());
  });

  await check('projects: timesheet approval by the manager', async () => {
    await page.keyboard.press('Escape');
    await actAs(page, 'MANAGER');
    await nav(page, 'Project control');
    await page.locator('#main-content [role="tab"]', { hasText: 'Time & expenses' }).click();
    await page.getByRole('button', { name: 'Approve' }).first().click();
    return toast(page, 'Time approved');
  });

  await open(page, 'fleet');
  await check('fleet: defect approval raises a work order', async () => {
    await actAs(page, 'TRANSPORT_MANAGER');
    await nav(page, 'Defect reports');
    await page.locator('tr', { hasText: 'submitted' }).first().click();
    await drawer(page).getByRole('button', { name: /Approve/ }).click();
    return toast(page, 'Defect approved');
  });

  await check('fleet: consolidation plan allocation and loading instruction', async () => {
    await page.keyboard.press('Escape');
    await nav(page, 'Consolidation plans');
    await page.locator('tr', { hasText: 'draft' }).first().click();
    await drawer(page).getByRole('button', { name: 'Allocate suggested' }).click();
    const allocated = await toast(page, 'Vehicles allocated');
    await drawer(page).getByRole('button', { name: 'Issue loading instruction' }).first().click();
    return allocated && (await toast(page, 'Loading instruction issued'));
  });

  await check('fleet: trip without an approved request is refused', async () => {
    await page.keyboard.press('Escape');
    await nav(page, 'Trips');
    await page.getByRole('button', { name: 'Start a trip' }).first().click();
    const modal = page.locator('.sx-modal');
    await modal.locator('select[aria-label="Trip type"]').selectOption('REQUEST');
    await modal.getByPlaceholder('e.g. Customer visit').fill('Board meeting in Limuru');
    await modal.getByPlaceholder('Nairobi → Nakuru').fill('Nairobi → Limuru');
    await modal.getByRole('button', { name: 'Start' }).click();
    const refused = await toast(page, 'approved vehicle request');
    await page.keyboard.press('Escape');
    return refused;
  });

  await check('containers: open KRA query blocks gate-in', async () => {
    await actAs(page, 'OFFICER');
    await nav(page, 'Containers');
    await page.locator('tr', { hasText: 'MSCU 4471203' }).first().click();
    await drawer(page).locator('select[aria-label="Move to"]').selectOption('GATED_IN');
    await drawer(page).locator('input[aria-label="Location"]').fill('Kilindini CFS gate');
    await drawer(page).getByRole('button', { name: 'Record move' }).click();
    return toast(page, 'open KRA query');
  });

  await check('containers: KRA query resolved by a second person', async () => {
    await page.keyboard.press('Escape');
    await actAs(page, 'MANAGER');
    await nav(page, 'Port discrepancies');
    await page.locator('tr', { hasText: 'MSCU 4471203' }).first().click();
    await drawer(page).locator('input[aria-label="Resolution"]').fill('Export entry amended to 4,410 kg');
    await drawer(page).getByRole('button', { name: 'Resolve' }).click();
    return toast(page, 'Resolved');
  });

  await check('fleet: simulated tracking page renders', async () => {
    await page.keyboard.press('Escape');
    await nav(page, 'Live tracking');
    return page.getByText('Simulated feed').isVisible();
  });
  await ctx.close();
}

/* ---------------- Viewer (read-only) ---------------- */
{
  const { ctx, page } = await session('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await open(page, 'maintenance');
  await check('viewer: maintenance request is refused as read-only', async () => {
    await nav(page, 'Requests & notices');
    await page.getByRole('button', { name: 'Report a fault' }).click();
    const modal = page.locator('.sx-modal');
    await modal.locator('select').first().selectOption({ index: 1 });
    await modal.locator('textarea').fill('Test from a viewer');
    await modal.getByRole('button', { name: 'Send request' }).click();
    return toast(page, 'read-only');
  });
  await open(page, 'fleet');
  await check('viewer: consolidation allocation is refused as read-only', async () => {
    await nav(page, 'Consolidation plans');
    await page.locator('tr', { hasText: 'draft' }).first().click();
    await drawer(page).getByRole('button', { name: 'Allocate suggested' }).click();
    return toast(page, 'read-only');
  });
  await ctx.close();
}

await browser.close();
for (const r of results) console.log(r);
for (const e of [...new Set(errors)]) console.log(e);
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`checks=${results.length} failed=${failed} errors=${errors.length}`);
process.exit(failed || errors.length ? 1 : 0);
