import { expect as playwrightExpect } from "@playwright/test";
import path from "path";
import type { BrowserContext, Page } from "playwright";
import { createFixture } from "playwright-webextext";

const TUTORIAL_WAIT_MS = 1_000;

const tutorialUrl = "https://lydell.github.io/LinkHints/tutorial.html";

const extensionPath = path.resolve(__dirname, "..", "compiled");

const { test, expect } = createFixture(extensionPath);

// Helper to activate hints
async function activateHints(
  page: Page,
  keystroke: string = "Alt+j"
): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector("#__LinkHintsWebExt")?.shadowRoot?.innerHTML ===
      undefined
  );
  // UGH I want to get rid of this so bad.
  await page.waitForTimeout(200);
  await page.keyboard.press(keystroke);
  await page.waitForFunction(
    () =>
      document.querySelector("#__LinkHintsWebExt")?.shadowRoot?.innerHTML !==
      undefined
  );
  // UGH I want to get rid of this so bad.
  await page.waitForTimeout(200);
}

// Helper to perform step 3 actions
async function performStep3(
  page: Page,
  context: BrowserContext,
  keystroke: string
): Promise<void> {
  // Wait for #step-3
  await page.waitForURL(/#step-3/);

  // Activate hints
  await activateHints(page, keystroke);

  // Snapshot
  await snapshotHints(
    page,
    `shadow-step3-${keystroke.replace(/[^a-zA-Z0-9]/g, "")}.html`
  );

  // Press 'o'
  await page.keyboard.press("e");

  // Check new tab
  let newPage: Page | undefined;
  await expect
    .poll(() => {
      const pages = context.pages();
      newPage = pages.find((p) => p.url().includes("example.com"));
      return newPage;
    })
    .toBeTruthy();
  await newPage?.close();
}

// Helper to snapshot hints
async function snapshotHints(page: Page, snapshotName: string): Promise<void> {
  const shadowHTML = await page.locator("#__LinkHintsWebExt").evaluate((el) => {
    if (el.shadowRoot === null) {
      throw new Error("Missing shadow DOM");
    }
    return el.shadowRoot.innerHTML;
  });
  playwrightExpect(shadowHTML).toMatchSnapshot(snapshotName);
  await playwrightExpect(page).toHaveScreenshot();
}

test("Run through tutorial", async ({
  context,
}: {
  context: BrowserContext;
}) => {
  console.log("Starting tutorial test");

  // Wait for the tutorial page to load.
  await new Promise((r) => {
    setTimeout(r, TUTORIAL_WAIT_MS);
  });

  // Now manually open the tutorial page
  const page = await context.newPage();
  await page.goto(tutorialUrl);
  await page.waitForLoadState("load");

  expect(page.url()).toBe(tutorialUrl);
  console.log("Tutorial page loaded");

  // Activate hints
  console.log("Activating hints for initial step");
  await activateHints(page);

  // Snapshot
  await snapshotHints(page, "shadow.html");
  console.log("Initial snapshot taken");

  // Simulate user selecting the first hint by pressing 'j'
  console.log("Pressing 'j' to go to step-1");
  await page.keyboard.press("j");

  // Check that the URL now includes #step-1
  await page.waitForURL(/#step-1/);
  console.log("Reached step-1");

  // Activate hints again on step-1
  console.log("Activating hints on step-1");
  await activateHints(page);

  // Snapshot hints on step-1
  await snapshotHints(page, "shadow-step1.html");
  console.log("Step-1 snapshot taken");

  // Press 'f' again to go to step-2
  console.log("Pressing 'f' to go to step-2");
  await page.keyboard.press("f");

  await page.waitForURL(/#step-2/);
  console.log("Reached step-2");

  // Activate hints on step-2
  console.log("Activating hints on step-2");
  await activateHints(page);

  // Snapshot hints on step-2
  await snapshotHints(page, "shadow-step2.html");
  console.log("Step-2 snapshot taken");

  // Press 'f' to go to step-3
  console.log("Pressing 'f' to go to step-3");
  await page.keyboard.press("f");

  // Perform step 3 with Alt+k
  console.log("Performing step-3 with Alt+k");
  await performStep3(page, context, "Alt+k");

  // Perform step 3 with Alt+l
  console.log("Performing step-3 with Alt+l");
  // XXX: I don't think we can tell if a tab has focus in playwright.  Maybe by taking a screenshot of the browser?
  await performStep3(page, context, "Alt+l");

  // Press escape to exit hints mode
  console.log("Pressing Escape to exit hints mode");
  await page.keyboard.press("Escape");

  // Press 'f' to go to step-4
  console.log("Activating hints and pressing 'f' to go to step-4");
  await activateHints(page);
  await page.keyboard.press("f");

  await page.waitForURL(/#step-4/);
  console.log("Reached step-4");

  // Activate hints on step-4
  console.log("Activating hints on step-4");
  await activateHints(page);

  // Snapshot hints on step-4
  await snapshotHints(page, "shadow-step4.html");
  console.log("Step-4 snapshot taken");

  // Type "1984"
  console.log("Typing '1984' on step-4");
  await page.keyboard.type("1984");

  // Look for the visible string "1984 is a novel by George Orwell."
  await expect(page.locator("html")).toContainText(
    "1984 is a novel by George Orwell."
  );
  console.log("Verified text '1984 is a novel by George Orwell.' is visible");

  // Then click one of the tiny pagination links
  console.log("Activating hints and typing '11' for pagination");
  await activateHints(page);
  await page.keyboard.type("11");

  // Then look for an a tag with text 11 in step-4 and verify it is focused
  await expect(
    page.locator("#step-4 a").filter({ hasText: "11" })
  ).toBeFocused();
  console.log("Verified link '11' is focused");

  await activateHints(page);
  console.log("Activating hints and pressing 'j' to go to step-5");
  await page.keyboard.press("j");

  await page.waitForURL(/#step-5/);
  console.log("Reached step-5");

  await activateHints(page);
  console.log("Activating hints on step-5");

  // Snapshot hints on step-5
  await snapshotHints(page, "shadow-step5.html");
  console.log("Step-5 snapshot taken");

  // Type "IM" and ensure that iMac is selected
  console.log("Typing 'IM' to select iMac");
  await page.keyboard.type("IM");
  await expect(
    page.locator("#step-5 a").filter({ hasText: "iMac" })
  ).toBeFocused();
  console.log("Verified iMac is focused");

  // Then try "IPHONE"
  console.log("Activating hints and typing 'IPHONE' to select iPhone");
  await activateHints(page);
  await page.keyboard.type("IPHONE");
  await expect(
    page.locator("#step-5 a").filter({ hasText: "iPhone" })
  ).toBeFocused();
  console.log("Verified iPhone is focused");

  await activateHints(page);
  console.log("Activating hints and pressing 'f' to go to step-6");
  await page.keyboard.press("f");

  await page.waitForURL(/#step-6/);
  console.log("Reached step-6");

  // Activate hints on step-6
  // This must be J, not j.
  console.log("Activating hints with Alt+Shift+J on step-6");
  await activateHints(page, "Alt+Shift+J");
  // Check boxes
  console.log("Typing 'gmv' to check checkboxes");
  await page.keyboard.type("gmv", { delay: 1000 });

  // Snapshot hints on step-6
  await snapshotHints(page, "shadow-step6.html");
  console.log("Step-6 snapshot taken");

  await page.keyboard.press("Escape");
  console.log("Pressed Escape to exit hints");

  // Verify that the checkboxes are checked
  await expect(page.locator('#step-6 input[id="lettuce"]')).toBeChecked();
  await expect(page.locator('#step-6 input[id="cucumber"]')).toBeChecked();
  await expect(page.locator('#step-6 input[id="tomato"]')).toBeChecked();
  console.log("Verified checkboxes are checked");

  // Then open example.com, mozilla.org, and wikipedia.org
  console.log("Activating hints with Alt+Shift+K to open links");
  await activateHints(page, "Alt+Shift+K");

  // Open links
  console.log("Typing 'eow' to open example.com, mozilla.org, wikipedia.org");
  await page.keyboard.type("eow", { delay: 1000 });
  await page.keyboard.press("Escape");
  console.log("Pressed Escape after opening links");

  const urls = ["example.com", "mozilla.org", "wikipedia.org"];
  for (const urlPart of urls) {
    console.log("Checking for new page with URL part:", urlPart);
    const pages = context.pages();
    const newPage = pages.find((p) => p.url().includes(urlPart));
    expect(newPage).toBeTruthy();
    await newPage?.close();
  }
  console.log("Verified new pages opened and closed");

  // Go to step-7
  console.log("Activating hints and pressing 'f' to go to step-7");
  await activateHints(page);
  await page.keyboard.press("f");

  await page.waitForURL(/#step-7/);
  console.log("Reached step-7");

  await activateHints(page, "Alt+Shift+L");
  console.log("Activating hints with Alt+Shift+L on step-7");

  // Snapshot hints on step-7
  await snapshotHints(page, "shadow-step7.html");
  console.log("Step-7 snapshot taken");

  // Select "Link Hints adds two extra shortcuts:"
  console.log("Pressing 'n' to select text");
  await page.keyboard.press("n");
  await page.waitForTimeout(1000);

  // Get the selected text and verify it is correct
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const selection = window.getSelection();
        return selection !== null ? selection.toString() : "";
      })
    )
    .toBe("Link Hints adds two extra shortcuts:");
  console.log("Verified selected text is correct");

  await activateHints(page, "Alt+Shift+L");
  console.log("Activating hints again with Alt+Shift+L");

  // Copy "Link Hints adds two extra shortcuts:" to clipboard
  console.log("Pressing Alt+n to copy selected text");
  await page.keyboard.press("Alt+n");

  // Verify clipboard contents
  await expect
    .poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("Link Hints adds two extra shortcuts:");
  console.log("Verified clipboard contents");

  console.log("Tutorial test completed");
});
