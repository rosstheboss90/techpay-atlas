import { expect, test } from '@playwright/test'

test('role similarity: lists pay-equivalent roles and clicking one re-anchors the role', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  const rsim = page.locator('.rsim')
  await rsim.scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: /Which roles pay like this one/i })).toBeVisible()

  const rows = page.locator('.rsim-row')
  expect(await rows.count()).toBeGreaterThan(1)

  // Clicking the top-ranked role re-anchors the app on it (the anchor is excluded from the list,
  // so this is a non-default role and the URL gains a role param).
  await page.locator('.rsim-name').first().click()
  await expect(page).toHaveURL(/[?&]role=\d{2}-\d{4}/)
})
