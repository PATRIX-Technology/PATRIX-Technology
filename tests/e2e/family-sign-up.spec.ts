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
    // Replaced by the Organisation / Family account tabs
    // (AccountTypeTabs, role="tab" not "link") — see docs/DECISIONS.md
    // "Structure app around Individual/Family vs B2B modes".
    await page.getByRole('tab', { name: 'Organisation' }).click();
    await expect(page).toHaveURL(/\/en\/sign-up$/);
  });

  test('marketing home links to the family sign-up page', async ({ page }) => {
    await page.goto('/en');
    await page.getByRole('link', { name: /for families/i }).click();
    await expect(page).toHaveURL(/\/en\/family\/sign-up$/);
  });
});
