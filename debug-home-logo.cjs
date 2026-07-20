const { chromium } = require("playwright");

const BASE = "http://localhost:8081";
const SUPER_ADMIN = { email: "siyante003@gmail.com", password: "229022#" };

async function loginAs(page, outletName, identifier, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const outletInput = page.locator('input[placeholder="e.g. Seven Mart"]');
  const identInput = page.locator('input[placeholder="you@example.com"]');
  const passInput = page.locator('input[type="password"]');
  for (let attempt = 0; attempt < 5; attempt++) {
    await outletInput.fill(outletName);
    await identInput.fill(identifier);
    await passInput.fill(password);
    if (
      (await outletInput.inputValue()) === outletName &&
      (await identInput.inputValue()) === identifier &&
      (await passInput.inputValue()) === password
    )
      break;
    await page.waitForTimeout(500);
  }
  await page.locator('button[type="submit"], button:has-text("Log In")').first().click();
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await page.waitForURL((u) => u.pathname !== "/login", { timeout: 3000 });
      break;
    } catch {
      if (attempt === 9) throw new Error(`Login failed`);
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await loginAs(page, "SEVEN MART", SUPER_ADMIN.email, SUPER_ADMIN.password);
  await page.waitForTimeout(1500);
  const dhiposTextInSidebar = await page.locator('span:text-is("Dhipos")').count();
  console.log("Standalone 'Dhipos' text span in sidebar:", dhiposTextInSidebar);
  await page.screenshot({ path: "home-logo-check.png", clip: { x: 0, y: 0, width: 260, height: 90 } });

  // Also check collapsed state
  await page.locator('button:has([data-sidebar="trigger"]), button svg').first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: "home-logo-check-collapsed.png", clip: { x: 0, y: 0, width: 90, height: 90 } });

  await browser.close();
})();
