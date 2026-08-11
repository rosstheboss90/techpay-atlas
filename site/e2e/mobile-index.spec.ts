import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile: collapsed index, tap-to-expand, height budget', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  // Heavy sections are not mounted while collapsed.
  await expect(page.locator('.h2h')).toHaveCount(0)

  // The "fits ~2 screens" promise, pinned (spec: < 1800px collapsed at 390px).
  const height = await page.evaluate(() => document.querySelector('main.page')!.scrollHeight)
  expect(height).toBeLessThan(1800)

  // Tap expands the card and the real chart renders inside it.
  await page.getByRole('button', { name: /Are you underpaid\?/ }).click()
  await expect(page.locator('.h2h .pct-band').first()).toBeVisible()
})

test('mobile: hash deep-link auto-expands its section', async ({ page }) => {
  await page.goto('/#rsim-h')
  // .rsim is briefly visible during the desktop-first render before the narrow state settles,
  // so visibility alone could pass on a broken deep-link. Wait for narrow to have settled
  // (another section collapsed to nothing) and pin the hash card's expanded state directly.
  await expect(page.locator('.h2h')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /What else could you be\?/ }))
    .toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.rsim')).toBeVisible()
})
