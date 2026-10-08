// End-to-end screen crawl: signs in as each demo role, opens every screen, clicks every module
// tab and sub-tab, and reports render crashes and console errors. Run against the dev server:
//   npm run dev -- --port 5199 &   node scripts/e2e/crawl.mjs http://localhost:5199
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://localhost:5199';
const VIEWS = ['apps','finance','trading','procurement','bizdev','warehousing','production','shipping','fleet','maintenance','quality','ict','integrations-hub','governance','implementation','approvals','executive','ess','org-setup','employee-requisition','recruitment','onboarding','employees','attendance','leave','payroll','performance','training','disciplinary','osh-security','separation','overview','work-queue','activity','users','organizations','workflows','integrations','roles','security','billing','audit','health','ai-insights','settings','forms-inputs','profile'];
const ROLES = [
  { email: 'admin@integrated.local', views: VIEWS },
  { email: 'd.otieno@intergrated-erp.ke', staffId: 'KHE-0134', views: ['finance','approvals','executive','procurement'] },
  { email: 'a.hassan@intergrated-erp.ke', staffId: 'KHE-0120', views: ['executive','finance','approvals'] },
  { email: 'r.chepkoech@intergrated-erp.ke', staffId: 'KHE-0290', views: ['payroll','leave','employees'] },
  { email: 'portal@intergrated-erp.ke', staffId: 'KHE-0102', views: ['ess'] }
];
const IGNORE = [/favicon/i, /Download the React DevTools/i];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
const problems = [];
let clicks = 0, screens = 0;
for (const role of ROLES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((s) => localStorage.setItem('ieui.session', JSON.stringify(s)), { email: role.email, staffId: role.staffId, signedInAt: Date.now(), expiresAt: Date.now() + 3.6e6 });
  const page = await ctx.newPage();
  let where = '';
  page.on('pageerror', (e) => problems.push(`[${role.email}] ${where} PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.some((r) => r.test(m.text()))) problems.push(`[${role.email}] ${where} CONSOLE ${m.text().slice(0, 300)}`); });
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length);
  for (const v of role.views) {
    where = v;
    const ok = await page.evaluate((view) => { const h = window.__erp; if (!h) return false; h.open(view); return true; }, v);
    if (!ok && role.email !== 'portal@intergrated-erp.ke') { problems.push(`[${role.email}] dev hook missing`); break; }
    await page.waitForTimeout(120);
    screens++;
    const navSel = '.sx-side-nav .sx-side-item, .module-sidebar .nav-item, aside .nav-item';
    const n = await page.locator(navSel).count();
    for (let i = 0; i < n; i++) {
      const item = page.locator(navSel).nth(i);
      const label = ((await item.textContent().catch(() => '')) ?? '').trim();
      where = `${v} > ${label}`;
      await item.click({ timeout: 2000 }).catch(() => {});
      clicks++;
      await page.waitForTimeout(60);
      const tabs = page.locator('#main-content [role="tab"], main [role="tab"]');
      const tn = await tabs.count();
      for (let j = 0; j < tn && j < 20; j++) {
        const t = tabs.nth(j);
        const tl = ((await t.textContent().catch(() => '')) ?? '').trim();
        where = `${v} > ${label} > ${tl}`;
        await t.click({ timeout: 1500 }).catch(() => {});
        clicks++;
        await page.waitForTimeout(40);
      }
      const alive = await page.evaluate(() => (document.querySelector('#root')?.innerHTML.length ?? 0) > 200);
      if (!alive) { problems.push(`[${role.email}] ${where} BLANK SCREEN`); await page.reload(); }
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`screens=${screens} clicks=${clicks} problems=${problems.length}`);
for (const p of [...new Set(problems)]) console.log(p);
process.exit(problems.length ? 1 : 0);
