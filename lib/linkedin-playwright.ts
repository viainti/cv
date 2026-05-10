export type LinkedInPlaywrightResult = {
  title: string;
  company: string;
  location: string;
  description: string;
  applyLabel: string;
  url: string;
};

type PlaywrightPage = {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
  evaluate<T>(fn: () => T): Promise<T>;
};

type PlaywrightBrowser = {
  close(): Promise<void>;
  newContext(): Promise<{ close(): Promise<void>; newPage: () => Promise<PlaywrightPage> }>;
};

function isLinkedInJobUrl(url: string) {
  return /linkedin\.com\/jobs\//i.test(url);
}

export async function inspectLinkedInJobWithPlaywright(url: string): Promise<LinkedInPlaywrightResult> {
  if (!isLinkedInJobUrl(url)) {
    throw new Error("La URL no parece ser una vacante de LinkedIn.");
  }

  const playwright = await import("playwright");
  const usePersistentContext = Boolean(process.env.PLAYWRIGHT_USER_DATA_DIR);

  let browser: PlaywrightBrowser | null = null;
  let context: { close(): Promise<void>; newPage: () => Promise<PlaywrightPage> } | null = null;
  let page: PlaywrightPage;

  try {
    if (usePersistentContext) {
      context = await playwright.chromium.launchPersistentContext(process.env.PLAYWRIGHT_USER_DATA_DIR as string, {
        channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
        headless: true
      });
      page = await context.newPage();
    } else {
      browser = (await playwright.chromium.launch({ headless: true })) as PlaywrightBrowser;
      context = await browser.newContext();
      page = await context.newPage();
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1800);
    await expandDescription(page);

    return await page.evaluate<LinkedInPlaywrightResult>(() => {
      const pick = (selectors: string[]) => {
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          const text = node?.textContent?.replace(/\s+/g, " ").trim();
          if (text) return text;
        }
        return "";
      };

      const title = pick([
        ".job-details-jobs-unified-top-card__job-title",
        ".top-card-layout__title",
        "h1"
      ]);
      const company = pick([
        ".job-details-jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
        ".jobs-unified-top-card__company-name",
        ".topcard__flavor a"
      ]);
      const location = pick([
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".jobs-unified-top-card__bullet",
        ".topcard__flavor--bullet"
      ]);
      const description = pick([
        ".jobs-description__content",
        ".jobs-box__html-content",
        ".show-more-less-html__markup",
        "article",
        "main"
      ]);
      const applyLabel = pick([
        "button.jobs-apply-button",
        "a.jobs-apply-button",
        "button[data-live-test-job-apply-button]"
      ]);

      return {
        title,
        company,
        location,
        description,
        applyLabel,
        url: window.location.href
      };
    });
  } finally {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}

async function expandDescription(page: PlaywrightPage) {
  const selectors = [
    ".jobs-description__footer-button",
    ".show-more-less-html__button--more",
    "button[aria-label*='Click to see more description']",
    "button[aria-label*='more']"
  ];

  for (const selector of selectors) {
    try {
      await page.click(selector, { timeout: 1200 });
      await page.waitForTimeout(500);
      return;
    } catch {
      // Continue trying the next selector.
    }
  }
}
