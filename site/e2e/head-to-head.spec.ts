import { expect, test } from '@playwright/test'

test('head-to-head: renders, choosing a vs metro updates the URL, target shows a percentile', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  const h2h = page.locator('.h2h')
  await h2h.scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: 'Are you underpaid?' })).toBeVisible()

  // Two metro selects + two percentile bands on a shared scale.
  await expect(page.getByLabel('Metro A')).toBeVisible()
  await expect(page.getByLabel('Metro B')).toBeVisible()
  expect(await page.locator('.h2h .pct-band').count()).toBe(2)

  // Choosing a different Metro B writes the vs param.
  const bSelect = page.getByLabel('Metro B')
  const optionValue = await bSelect.locator('option').nth(5).getAttribute('value')
  await bSelect.selectOption(optionValue!)
  await expect(page).toHaveURL(new RegExp(`[?&]vs=${optionValue}`))

  // A target salary yields a percentile readout and a marker line.
  await page.getByLabel('Target salary').fill('150000')
  await expect(page.locator('.h2h-pct').first()).toContainText(/percentile/)
  expect(await page.locator('.h2h .pct-marker').count()).toBeGreaterThanOrEqual(1)
})
