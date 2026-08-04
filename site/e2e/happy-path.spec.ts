import { expect, test } from '@playwright/test'

test('load -> click Austin -> toggle COL', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()
  // Map rendered with bubbles
  const bubbles = page.locator('.map-bubble')
  await expect(bubbles.first()).toBeVisible()
  expect(await bubbles.count()).toBeGreaterThan(300)

  // Deep-link straight to Austin (more robust than clicking a specific bubble)
  await page.goto('/?metro=12420')
  await expect(page.getByRole('heading', { name: /Austin-Round Rock/ })).toBeVisible()
  await expect(page.getByText('Amazon.com Services LLC')).toBeVisible()
  const nominalMedian = await page.locator('.headline-stats dd').first().textContent()

  // COL toggle changes the displayed median and the URL
  await page.getByRole('button', { name: /cost of living/i }).click()
  await expect(page.locator('.headline-stats dd').first()).not.toHaveText(nominalMedian!)
  expect(page.url()).toContain('adj=1')

  // Screenshot for the visual pass
  await page.screenshot({ path: 'e2e/screenshots/dashboard.png', fullPage: true })
})
