import { expect, test } from '@playwright/test'

test('about: reachable from the masthead, renders live figures, links back', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  // The masthead link (client-rendered once data loads) navigates to the story.
  await page.getByRole('link', { name: /About the data/ }).click()
  await expect(page).toHaveURL(/\/about/)
  await expect(page.getByRole('heading', { name: /round away/i })).toBeVisible()

  // Figures compute from the shipped data — the conflation gap line comes out of titles.json.
  await expect(page.locator('.ab-fig svg').first()).toBeVisible()
  await expect(page.getByText(/gap the shared code erases/)).toBeVisible()

  // Back to the tool.
  await page.getByRole('link', { name: /Open the live atlas/ }).click()
  await expect(page.locator('.map-bubble').first()).toBeVisible()
})
