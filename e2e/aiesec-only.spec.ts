import { expect, test } from "@playwright/test";

// AIESEC-only forms (ADR-013). Uses the local dev login (DEV_LOGIN=1) as the
// signed-in member and a public echo endpoint as the webhook destination.
test("an AIESEC-only form asks people to sign in and takes one response each", async ({ page, browser, isMobile }) => {
  test.skip(isMobile, "Builder steps run on desktop; the gate is plain HTML on every screen.");
  test.setTimeout(240_000);

  await page.goto("/api/auth/dev-login");
  await expect(page).toHaveURL(/\/forms$/);
  // Retry until the dashboard has hydrated (a click before that does nothing). Buttons are disabled while a form is created.
  const blank = page.getByRole("button", { name: /Blank form/ }).first();
  const editor = /\/forms\/[0-9a-f-]+\/edit/;
  await expect(async () => {
    if (editor.test(page.url())) return;
    if (!(await blank.isVisible())) await page.getByRole("button", { name: "New form" }).click({ timeout: 2_000 });
    await blank.click({ timeout: 3_000 });
    await expect(page).toHaveURL(editor, { timeout: 30_000 });
  }).toPass({ timeout: 120_000 });

  await page.getByLabel("Form title", { exact: true }).fill("Members check-in");
  await page.getByRole("button", { name: /Edit question 1/ }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("Which committee are you in?");

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByText("People who sign in with AIESEC", { exact: true }).click();
  await page.getByRole("switch", { name: "One response per person" }).check();

  await page.getByRole("tab", { name: "Connect" }).click();
  await page.getByRole("button", { name: /^Webhook/ }).click();
  await page.getByLabel("Webhook URL").fill("https://postman-echo.com/post");
  await page.getByRole("button", { name: "Connect webhook" }).click();
  await expect(page.getByText("Webhook connected")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Share your form" })).toBeVisible({ timeout: 30_000 });
  const link = ((await page.getByLabel("Form link", { exact: true }).textContent()) ?? "").trim();
  const slug = link.split("/f/")[1];
  expect(slug).toMatch(/^[a-z0-9-]+$/);

  // Signed out: the sign-in screen, and embeds send people to a new tab.
  const visitor = await browser.newPage();
  await visitor.goto(`/f/${slug}`);
  await expect(visitor.getByRole("heading", { name: "Sign in with AIESEC to answer" })).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Sign in with AIESEC" })).toHaveAttribute("href", `/api/auth/login?purpose=respond&returnTo=${encodeURIComponent(`/f/${slug}`)}`);
  await visitor.goto(`/embed/${slug}`);
  await expect(visitor.getByRole("link", { name: /Open the form/ })).toHaveAttribute("href", `/f/${slug}`);
  // The API refuses too, not just the page.
  const refused = await visitor.request.post(`/api/f/${slug}/submit`, {
    headers: { Origin: new URL(link).origin },
    data: { responseId: "00000000-0000-4000-8000-000000000001", renderToken: "x", answers: {} },
  });
  expect([401, 403]).toContain(refused.status());
  await visitor.close();

  // Signed in as a member: answer once, then the form says you've responded.
  await page.goto(`/f/${slug}`);
  await expect(page.getByText(/Answering as/)).toBeVisible();
  await page.getByLabel(/Which committee are you in/).fill("Marketing");
  await page.waitForTimeout(2500); // the render token must be a couple of seconds old
  await page.getByRole("button", { name: /Send response/ }).click();
  await expect(page.getByText("Thanks, we got your response")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "You've already responded" })).toBeVisible();
});
