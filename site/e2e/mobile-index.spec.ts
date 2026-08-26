import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile: every section renders its real chart, uncollapsed', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'TechPay Atlas' })).toBeVisible()

  // The whole point of the redesign: heavy sections are mounted without any interaction.
  await expect(page.locator('.h2h')).toHaveCount(1)
  await expect(page.locator('.salary-map')).toBeVisible()
  await expect(page.locator('.rsim')).toHaveCount(1)
  await expect(page.locator('.heatmap')).toHaveCount(1)
  await expect(page.locator('.qsec')).toHaveCount(7)
  // Scoped to the app's own content root: `next dev` injects an "Open Next.js Dev Tools"
  // button outside <main>, which the unscoped role query would otherwise false-positive on.
  await expect(page.locator('main.page').getByRole('button', { name: /open|expand/i })).toHaveCount(0)
})

test('mobile: page height budget', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.qsec')).toHaveCount(7)

  // TitleLens fetches titles.json lazily behind an IntersectionObserver and only mounts
  // once the section scrolls into view, so measuring right after goto() pins a page state
  // no real user sees after scrolling.
  //
  // Force the lazy fetch and wait for the DOM it produces — NOT waitForLoadState, which
  // resolves against the cached post-goto flag (goto() already reached networkidle before
  // we ever scroll) and would silently let this test measure the pre-fetch page. .tl-rows
  // does not exist until titles.json resolves (TitleLens.tsx renders a "Loading…" paragraph
  // in its place until then), which makes it a deterministic post-load marker.
  await page.locator('#tl-h').scrollIntoViewIfNeeded()
  await expect(page.locator('.tl-rows')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))

  // 5,100px reflects the fully-loaded page, including the title lens's rows once
  // titles.json has fetched. Exceeding this is a signal to RE-WEIGHT sections, not to
  // raise the pin — the budget is the design decision.
  const height = await page.evaluate(() => document.querySelector('main.page')!.scrollHeight)
  expect(height).toBeLessThan(5100)
})

test('mobile: the similar-roles section stays capped', async ({ page }) => {
  await page.goto('/')
  const rsim = page.locator('.rsim')
  await expect(rsim).toBeVisible()

  // This section measured 2,063px uncapped — a third of the whole page. Pin it directly:
  // a regression here is invisible in the total until it is large.
  const h = await rsim.evaluate(el => (el as HTMLElement).getBoundingClientRect().height)
  expect(h).toBeLessThan(700)

  await page.getByRole('button', { name: /see all \d+ roles/i }).click()
  const expanded = await rsim.evaluate(el => (el as HTMLElement).getBoundingClientRect().height)
  expect(expanded).toBeGreaterThan(h)
})

test('mobile: explorer opens, filters, selects, and lands on the metro panel', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /explore the map/i }).click()

  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg).toHaveAttribute('data-zoom', 'fit')

  await dlg.getByRole('button', { name: '2×' }).click()
  await expect(dlg).toHaveAttribute('data-zoom', '2x')

  await dlg.getByRole('searchbox').fill('San Jose')
  await dlg.getByRole('button', { name: /San Jose/ }).click()

  await expect(dlg).toBeHidden()
  await expect(page.locator('.metro-panel')).toBeVisible()
})

test('mobile: hash deep-link scrolls to its section', async ({ page }) => {
  await page.goto('/#rsim-h')
  await expect(page.locator('.rsim')).toBeVisible()

  // globals.css sets `html { scroll-behavior: smooth }`, so the hash-scroll effect's
  // scrollIntoView() animates instead of jumping. Reading the position immediately races
  // that animation and lands on an arbitrary mid-scroll value — poll scrollY until two
  // consecutive reads agree (settled) before measuring the real, settled position.
  let last = -1
  for (let i = 0; i < 50; i++) {
    const y = await page.evaluate(() => window.scrollY)
    if (y === last) break
    last = y
    await page.waitForTimeout(100)
  }

  const top = await page.locator('#rsim-h').evaluate(el => el.getBoundingClientRect().top)
  expect(Math.abs(top)).toBeLessThan(200)
})

test('mobile: the full ranking opens, re-ranks on count change, and finds a city', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /see the full ranking/i }).click()

  const dlg = page.getByRole('dialog')
  await expect(dlg).toBeVisible()
  await expect(dlg.locator('.sx-table tbody tr')).toHaveCount(25)
  await expect(dlg.locator('.sx-basis')).toContainText('25 metros shown')

  // The ranks are recomputed for the visible set, not sliced from a fixed list — so a metro's
  // rise/fall must actually change when the set widens. If this ever stops being true, the
  // caption is lying and this assertion is the thing that catches it.
  const laDelta = dlg.locator('.sx-table tbody tr', { hasText: 'Los Angeles' }).locator('.sx-delta')
  const at25 = await laDelta.textContent()

  // Read N off the button so the wait below can assert the SPECIFIC post-click count. Waiting on
  // "metros shown" alone would be a no-op — that string is in the caption at every count, so the
  // assertion passes before React has re-rendered and the delta below gets read stale. That is
  // how this test failed in CI while passing locally: 375 rows take longer to commit than 25.
  const allBtn = dlg.getByRole('button', { name: /^All \d+$/ })
  const allCount = (await allBtn.textContent())!.match(/\d+/)![0]

  await allBtn.click()
  await expect(dlg.locator('.sx-basis')).toContainText(`${allCount} metros shown`)
  await expect(dlg.locator('.sx-table tbody tr')).toHaveCount(Number(allCount))

  const atAll = await laDelta.textContent()
  expect(atAll).not.toBe(at25)

  // Filter jumps to a city outside the default cap and highlights its row.
  await dlg.getByRole('searchbox').fill('Boise')
  await dlg.getByRole('button', { name: /Boise/ }).click()
  await expect(dlg.locator('.sx-table tr.is-hit')).toContainText('Boise')

  await dlg.getByRole('button', { name: /close/i }).click()
  await expect(dlg).toBeHidden()
})
