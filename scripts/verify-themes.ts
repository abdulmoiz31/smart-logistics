import { chromium, type Page } from 'playwright';

const BASE_URL = process.env.VERIFY_BASE_URL ?? 'http://localhost:3002';

// Never hardcode the console password: this file is committable and the value is live.
const SECRET = process.env.AGENT_CONSOLE_SECRET;
if (!SECRET) {
  throw new Error(
    'AGENT_CONSOLE_SECRET is not set. Run with:\n' +
    '  AGENT_CONSOLE_SECRET=$(grep ^AGENT_CONSOLE_SECRET= .env.local | cut -d= -f2-) npx tsx scripts/verify-themes.ts',
  );
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `/Users/abdulmoiz/personal-workspace/smart-logistics/tmp/${name}.png`, fullPage: true });
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('movescan-theme', t);
  }, theme);
  await page.waitForTimeout(200);
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/agent/login`);
  await page.fill('input[type="password"]', SECRET!);
  await page.click('button:has-text("Open console")');
  await page.waitForURL((url) => url.pathname.startsWith('/agent') && url.pathname !== '/agent/login');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Customer home should stay light regardless of theme.
  await page.goto(`${BASE_URL}/`);
  await setTheme(page, 'dark');
  await screenshot(page, 'home-dark-theme-preference');

  // Login page in both themes.
  await page.goto(`${BASE_URL}/agent/login`);
  await setTheme(page, 'dark');
  await screenshot(page, 'login-dark');
  await setTheme(page, 'light');
  await screenshot(page, 'login-light');

  // Authenticate via form.
  await login(page);

  // Queue in both themes.
  await page.goto(`${BASE_URL}/agent`);
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'queue-light');
  await setTheme(page, 'dark');
  await page.goto(`${BASE_URL}/agent`);
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'queue-dark');

  // Insights in both themes.
  await page.goto(`${BASE_URL}/agent/leads`);
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'leads-dark');
  await setTheme(page, 'light');
  await page.goto(`${BASE_URL}/agent/leads`);
  await page.waitForLoadState('networkidle');
  await screenshot(page, 'leads-light');

  // Toggle table view on the trend chart.
  await page.click('section:has-text("Activity trend") button:has-text("Table")');
  await screenshot(page, 'leads-table-view');

  // Quote detail if any exist.
  const response = await page.evaluate(async () => {
    const res = await fetch('/api/agent/queue');
    return res.json();
  });
  const quotes = (response as { quotes?: { id: string }[] }).quotes ?? [];
  if (quotes.length > 0) {
    await page.goto(`${BASE_URL}/agent/${quotes[0].id}`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'detail-light');
    await setTheme(page, 'dark');
    await page.goto(`${BASE_URL}/agent/${quotes[0].id}`);
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'detail-dark');

    // Open the first photo lightbox.
    await page.click('article button:has(img)');
    await screenshot(page, 'detail-lightbox');
  }

  await browser.close();
  console.log('Screenshots saved to ./tmp');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
