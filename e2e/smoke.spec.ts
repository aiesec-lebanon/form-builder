import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to sign in and come back", async ({ page }) => {
  await page.goto("/forms");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fforms/);
  await expect(page.getByRole("link", { name: "Continue with AIESEC" })).toBeVisible();
});

test("unknown forms show a helpful not-found page", async ({ page }) => {
  await page.goto("/f/this-form-does-not-exist");
  await expect(page.getByRole("heading", { name: /can.t find/i })).toBeVisible();
});

test("an owner builds a form with the keyboard and previews it", async ({ page, isMobile }) => {
  await page.goto("/api/auth/dev-login");
  await expect(page).toHaveURL(/\/forms$/);

  const newForm = page.getByRole("button", { name: "New form" });
  if (await newForm.isVisible()) await newForm.click();
  await page.getByRole("button", { name: /Blank form/ }).first().click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+\/edit/);

  await page.getByLabel("Form title", { exact: true }).fill("Smoke test form");
  await page.getByRole("button", { name: /Edit question 1/ }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Your name");
  await page.getByRole("switch", { name: "Required" }).check();

  // Add a multiple-choice question from the quick-add dialog and type options with Enter.
  if (isMobile) await page.getByRole("button", { name: "Add question", exact: true }).last().click();
  else await page.keyboard.press("Escape").then(() => page.keyboard.press("/"));
  await page.getByPlaceholder(/Find a question type/).fill("multiple");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Pick one");
  const option = page.getByLabel("Option 1", { exact: true });
  await option.fill("Yes");
  await option.press("Enter");
  await page.keyboard.type("No");

  // The status is icon-only on phones, so read its accessible text.
  await expect.poll(async () => page.getByRole("status").first().textContent(), { timeout: 15_000 }).toContain("Saved");

  // Preview validates like the live form, without sending anything.
  if (isMobile) {
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Preview" }).click();
  } else {
    await page.getByRole("button", { name: "Preview" }).click();
  }
  const preview = page.getByRole("dialog", { name: "Preview" });
  await preview.getByRole("button", { name: "Send response" }).click();
  await expect(preview.getByText(/answer to fix/)).toBeVisible();
  await preview.getByLabel("Your name").fill("Lina");
  await preview.getByText("Yes", { exact: true }).click();
  await preview.getByRole("button", { name: "Send response" }).click();
  await expect(preview.getByText("This is a preview. Nothing was sent.")).toBeVisible();
});
