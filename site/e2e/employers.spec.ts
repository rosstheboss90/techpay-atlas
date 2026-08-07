import { expect, test } from '@playwright/test'

test('the atlas masthead links to the employer lens', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Employers/ }).click()
  await expect(page).toHaveURL(/\/employers/)
  await expect(page.getByRole('heading', { name: 'Employers', level: 1 })).toBeVisible()
})

test('the index lists head employers and links through to a profile', async ({ page }) => {
  await page.goto('/employers')
  await page.getByRole('link', { name: 'Amazon', exact: true }).click()
  await expect(page).toHaveURL(/\/employers\/amazon/)
  await expect(page.getByRole('heading', { name: /Amazon/, level: 1 })).toBeVisible()
  // Scoped to the lede: "filings" also appears on every entity row and every metro row, so a
  // bare text match is a strict-mode violation against ~39 elements.
  await expect(page.locator('.t-lede')).toContainText(/[\d,]+ H-1B filings/)
})

test('a tail employer is searchable but is not linked to a page that does not exist', async ({ page }) => {
  await page.goto('/employers')
  // "sheetz" is far outside the top 500, so it exists only in an index shard — no profile file
  // is emitted for it, so generateStaticParams never produces /employers/sheetz.
  await page.getByRole('searchbox').fill('sheetz')
  const row = page.locator('.es-row', { hasText: /Sheetz/i }).first()
  await expect(row).toBeVisible()
  await expect(row.locator('a')).toHaveCount(0)
  await expect(row.getByText(/indexed only/i)).toBeVisible()
})

test('a head employer IS linked, and the link resolves', async ({ page }) => {
  await page.goto('/employers')
  await page.getByRole('searchbox').fill('cognizant')
  const row = page.locator('.es-row', { hasText: /^Cognizant/ }).first()
  await row.locator('a').click()
  await expect(page).toHaveURL(/\/employers\/cognizant/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Cognizant/)
})

test('the entity disclosure makes the alias merge auditable', async ({ page }) => {
  await page.goto('/employers/amazon')
  // Click the <summary> specifically. Its text is split across JSX text nodes, so a text
  // matcher resolves to the enclosing <details> instead — and clicking <details> does not
  // toggle it, so the disclosure silently stays shut and the assertion below fails.
  const disclosure = page.locator('details.emp-entities')
  await expect(disclosure.locator('summary')).toContainText(/includes \d+ filing entities/i)
  await disclosure.locator('summary').click()
  // exact:true because getByText is case-insensitive by default, and Amazon genuinely filed
  // both "Amazon.com Services LLC" and "AMAZON.COM SERVICES LLC" — the list shows them as the
  // separate strings they were filed as, which is the point of the disclosure.
  await expect(disclosure.getByText('Amazon.com Services LLC', { exact: true })).toBeVisible()
  await expect(disclosure.getByText('AMAZON.COM SERVICES LLC', { exact: true })).toBeVisible()
})

test('the staffing toggle hides known staffing firms', async ({ page }) => {
  await page.goto('/employers')
  const cognizant = page.getByRole('link', { name: 'Cognizant', exact: true })
  await expect(cognizant).toBeVisible()
  await page.getByRole('checkbox', { name: /staffing/i }).check()
  await expect(cognizant).toHaveCount(0)
})

test('both honesty disclaimers appear on a profile', async ({ page }) => {
  await page.goto('/employers/amazon')
  await expect(page.getByText(/base-pay/i).first()).toBeVisible()
  await expect(page.getByText(/sponsors only/i).first()).toBeVisible()
})
