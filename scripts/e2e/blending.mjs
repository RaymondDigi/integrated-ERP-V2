// End-to-end check of tea blending: a blendsheet goes from draft to approved to issued, the role checks
// refuse the wrong person, and the read-only demo account cannot change production records.
//   npx vite --port 5204 --strictPort &   node scripts/e2e/blending.mjs http://localhost:5204
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5204';
const IGNORE = [/favicon/i, /Download the React DevTools/i];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const problems = [];
const passed = [];
const check = (name, ok, detail = '') => (ok ? passed.push(name) : problems.push(`${name}${detail ? ` — ${detail}` : ''}`));

const session = async (email, staffId) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email, staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${email}] PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) problems.push(`[${email}] CONSOLE ${m.text().slice(0, 300)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length);
  await page.evaluate(() => window.__erp.open('production'));
  await page.waitForTimeout(300);
  return { ctx, page };
};
const nav = async (page, label) => {
  await page.locator('.sx-side-nav .sx-side-item, .module-sidebar .nav-item, aside .nav-item').filter({ hasText: label }).first().click();
  await page.waitForTimeout(250);
};
const actAs = async (page, role) => {
  await page.locator('select[aria-label="Acting as"]').first().selectOption(role);
  await page.waitForTimeout(150);
};
const body = (page) => page.locator('body').innerText();
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();

/* ---------------- Happy path as the administrator ---------------- */
{
  const { ctx, page } = await session('admin@integrated.local');

  await nav(page, 'Tea lots');
  let text = await body(page);
  check('tea lots listed', /Mombasa|Sale/i.test(text) && /BP1|PF1/.test(text));

  await nav(page, 'Blendsheets');
  await actAs(page, 'OFFICER');
  await button(page, 'New blendsheet').click();
  await page.waitForTimeout(200);
  await page.locator('.modal-footer button, [role="dialog"] button').filter({ hasText: /^Create$/ }).first().click();
  await page.waitForTimeout(400);
  text = await body(page);
  const num = (text.match(/\bBS-\d{4}-\d{4}/g) ?? []).sort().at(-1);
  check('blendsheet created with lots proposed', /Blendsheet (created|prepared)|Draft/i.test(text), num ?? 'no number');

  await button(page, 'Submit for approval').click();
  await page.waitForTimeout(300);
  check('blendsheet submitted', /Awaiting approval/.test(await body(page)));

  // Role check: the officer who prepared it cannot approve it.
  await button(page, 'Approve').click();
  await page.waitForTimeout(300);
  text = await body(page);
  check('officer refused approval', /Quality Controller|Quality or the Manager|someone else must approve/i.test(text));

  await actAs(page, 'QC');
  await button(page, 'Approve').click();
  await page.waitForTimeout(300);
  check('quality approved blendsheet', /Approved/.test(await body(page)));

  await actAs(page, 'STOREKEEPER');
  await button(page, 'Issue teas to the plant').click();
  await page.waitForTimeout(400);
  text = await body(page);
  check('teas issued, blend in progress', /Blending/.test(text) && /Run a chop/.test(text));
  await page.keyboard.press('Escape');

  await nav(page, 'Schedule');
  check('schedule gantt rendered', (await page.locator('.bl-gantt').count()) > 0);

  await nav(page, 'Reports');
  await page.getByRole('tab', { name: /Work in process/ }).click();
  await page.waitForTimeout(200);
  text = await body(page);
  check('WIP report shows the issued blend', num ? text.includes(num) : /Blend/.test(text), num ?? '');
  await page.getByRole('tab', { name: /Manufacturing GL/ }).click();
  await page.waitForTimeout(200);
  check('manufacturing GL lists production journals', /Production ·/.test(await body(page)));
  await ctx.close();
}

/* ---------------- Read-only account ---------------- */
{
  const { ctx, page } = await session('a.hassan@intergrated-erp.ke', 'KHE-0120');
  await nav(page, 'Blendsheets');
  await button(page, 'New blendsheet').click();
  await page.waitForTimeout(200);
  await page.locator('.modal-footer button, [role="dialog"] button').filter({ hasText: /^Create$/ }).first().click();
  await page.waitForTimeout(400);
  check('viewer refused as read-only account', /read-only account/i.test(await body(page)));
  await ctx.close();
}

await browser.close();
console.log(`passed=${passed.length} problems=${problems.length}`);
for (const p of passed) console.log(`ok   ${p}`);
for (const p of [...new Set(problems)]) console.log(`FAIL ${p}`);
process.exit(problems.length ? 1 : 0);
