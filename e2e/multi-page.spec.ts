import { expect, test } from "@playwright/test";

// Regression: on a multi-page form, Next used to send the form (React reused the
// clicked Next button as the Send button before the click finished).
test("Next moves to the next page and never sends the form", async ({ page, isMobile }) => {
  test.skip(isMobile, "Builder steps run on desktop.");
  test.setTimeout(180_000);

  await page.goto("/api/auth/dev-login");
  await expect(page).toHaveURL(/\/forms$/);
  const blank = page.getByRole("button", { name: /Blank form/ }).first();
  const editor = /\/forms\/[0-9a-f-]+\/edit/;
  await expect(async () => {
    if (editor.test(page.url())) return;
    if (!(await blank.isVisible())) await page.getByRole("button", { name: "New form" }).click({ timeout: 2_000 });
    await blank.click({ timeout: 3_000 });
    await expect(page).toHaveURL(editor, { timeout: 30_000 });
  }).toPass({ timeout: 120_000 });

  await page.getByLabel("Form title", { exact: true }).fill("Two pages");
  await page.getByRole("button", { name: /Edit question 1/ }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Your name");
  await page.getByRole("complementary", { name: "Question types" }).getByRole("button", { name: "New page" }).click();

  await page.getByRole("button", { name: "Preview" }).click();
  const preview = page.getByRole("dialog", { name: "Preview" });
  await expect(preview.getByText("Page 1 of 2")).toBeVisible();
  await preview.getByLabel(/Your name/).fill("Lina");
  await preview.getByRole("button", { name: "Next" }).click();
  await expect(preview.getByText("Page 2 of 2")).toBeVisible();
  await expect(preview.getByText("Thanks, we got your response")).toHaveCount(0);

  // Enter on page 1 never sends either.
  await preview.getByRole("button", { name: "Back" }).click();
  await preview.getByLabel(/Your name/).press("Enter");
  await expect(preview.getByText("Page 1 of 2")).toBeVisible();
  await expect(preview.getByText("Thanks, we got your response")).toHaveCount(0);
  await preview.getByRole("button", { name: "Next" }).click();

  await preview.getByRole("button", { name: /Send response/ }).click();
  await expect(preview.getByText("Thanks, we got your response")).toBeVisible();
});
