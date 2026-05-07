import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.VIEWPORT_BASE_URL || "http://127.0.0.1:8080";
const screenshotDir = "test-results/viewport-screenshots";

const viewports = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-13-14", width: 390, height: 844 },
  { name: "pixel", width: 412, height: 915 },
  { name: "small-android", width: 360, height: 800 }
];

const routes = [
  { name: "home", action: async () => {} },
  { name: "user", action: async (page) => clickFirst(page, ["#open-user", "[data-menu-action='user']"]) },
  { name: "menu", action: async (page) => clickFirst(page, ["#home-shortcut", "#open-menu"]) },
  { name: "form-step-1", action: async (page) => clickFirst(page, ["#start-new"]) },
  { name: "map", action: async (page) => clickFirst(page, ["#open-map"]) }
];

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      await locator.click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
      return;
    }
  }
}

async function measure(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const elements = Array.from(document.body.querySelectorAll("*"));
    const overflow = elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: String(element.className || ""),
          left: rect.left,
          right: rect.right,
          width: rect.width
        };
      })
      .filter((item) => item.right > width + 1 || item.left < -1);
    const menu = document.querySelector(".app-menu-panel");
    const header = document.querySelector(".app-header");
    return {
      classes: document.documentElement.className,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      innerWidth: width,
      overflowCount: overflow.length,
      overflow: overflow.slice(0, 10),
      menuWidth: menu ? Math.round(menu.getBoundingClientRect().width) : null,
      headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null
    };
  });
}

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch();
const results = [];

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      await page.addInitScript(() => {
        localStorage.setItem("sieweczka-auth-v1", JSON.stringify({
          token: "viewport-check-token",
          user: { id: "viewport-check", email: "viewport@example.test", name: "Viewport Check", role: "admin" }
        }));
      });
      await page.goto(`${baseUrl}/index.html?v=2026.05.07-responsive-ui-6`, { waitUntil: "networkidle" });
      await route.action(page);
      await page.screenshot({ path: `${screenshotDir}/${viewport.name}-${route.name}.png`, fullPage: true });
      const data = await measure(page);
      results.push({ viewport: `${viewport.name} ${viewport.width}x${viewport.height}`, route: route.name, ...data });
      if (data.documentScrollWidth > data.innerWidth + 1 || data.bodyScrollWidth > data.innerWidth + 1 || data.overflowCount > 0) {
        console.error(JSON.stringify({ viewport: viewport.name, route: route.name, overflow: data.overflow }, null, 2));
        process.exitCode = 1;
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.table(results.map((result) => ({
  viewport: result.viewport,
  route: result.route,
  classes: result.classes,
  scrollWidth: Math.max(result.documentScrollWidth, result.bodyScrollWidth),
  innerWidth: result.innerWidth,
  overflowCount: result.overflowCount,
  menuWidth: result.menuWidth ?? "",
  headerHeight: result.headerHeight ?? ""
})));
