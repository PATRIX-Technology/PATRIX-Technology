import { test, expect } from '@playwright/test';

test.describe('Family sign-up (Phase 4)', () => {
  test('renders the family sign-up form', async ({ page }) => {
    await page.goto('/en/family/sign-up');
    await expect(page.getByLabel(/your full name/i)).toBeVisible();
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create my family account/i })).toBeVisible();
  });

  test('links to the nursery/organisation sign-up for the other audience', async ({ page }) => {
    await page.goto('/en/family/sign-up');
    await page.getByRole('link', { name: /sign up here instead/i }).click();
    await expect(page).toHaveURL(/\/en\/sign-up$/);
  });

  test('marketing home links to the family sign-up page', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('link', { name: /for families/i }).click();
    await expect(page).toHaveURL(/\/en\/family\/sign-up$/);
  });
});

test.describe('Gift page (Phase 4)', () => {
  test('renders with billing disabled by default', async ({ page }) => {
    await page.goto('/en/gift');
    await expect(page.getByRole('heading', { name: /give a personalised story/i })).toBeVisible();
    // FEATURE_BILLING defaults to off, so the purchase form is replaced by
    // an explanatory message rather than a non-functional payment form.
    await expect(page.getByText(/enabled on this deployment/i)).toBeVisible();
  });
});
