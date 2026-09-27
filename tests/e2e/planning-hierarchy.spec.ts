import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { addCandidateFixture, resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

for (const width of [1280, 390]) {
  test(`Plan prioritizes dates and keeps saving clear at ${width}px`, async ({ page }) => {
    const fixture = await resetFixtures()
    await prisma.workshopDefinition.update({
      where: { id: 'fixture-definition-1' },
      data: {
        deliveryStartsOn: new Date('2027-01-04T00:00:00Z'),
        deliveryEndsOn: new Date('2027-01-29T00:00:00Z'),
      },
    })
    await prisma.classMeeting.deleteMany()
    await addCandidateFixture(fixture.cls.id, '2027-01-04')
    await addCandidateFixture(fixture.sibling.id, '2027-01-11')
    await page.setViewportSize({ width, height: 844 })
    await login(page, fixture.admin.email, 'admin')
    await page.goto('/admin/workshop-definitions/fixture-definition-1?step=plan')

    await expect(
      page.getByRole('heading', { name: 'Choose a date and time for each teacher' })
    ).toBeVisible()
    await expect(
      page.getByText(/The delivery window is the overall date range—not a booking/)
    ).toBeVisible()
    const manage = page.getByText('Manage included teachers', { exact: true }).locator('..')
    const optional = page.getByText('Session details (optional)', { exact: true }).locator('..')
    await expect(manage).not.toHaveAttribute('open', '')
    await expect(optional).not.toHaveAttribute('open', '')
    await expect(page.locator('#add-classes')).not.toHaveAttribute('open', '')
    await expect(page.getByLabel('Show seven days starting')).toBeHidden()
    await page.getByText(/Date options:.*Change week/).click()
    await expect(page.getByLabel('Show seven days starting')).toBeVisible()
    await expect(page.getByText(/it does not select a date for any teacher/)).toBeVisible()
    await page.getByText(/Date options:.*Change week/).click()
    await expect(page.getByRole('region', { name: 'Staffing check', exact: true })).toHaveCount(0)
    const dates = page.getByRole('region', { name: 'Choose teacher dates', exact: true })
    expect(
      await dates.evaluate((element) =>
        Boolean(
          element.compareDocumentPosition(document.querySelector('#add-classes')!) &
          Node.DOCUMENT_POSITION_FOLLOWING
        )
      )
    ).toBe(true)

    const save = page.getByRole('region', { name: 'Save teacher dates', exact: true })
    await expect(
      save.getByRole('button', { name: 'Save dates & continue', exact: true })
    ).toBeDisabled()
    const biology = page.getByLabel('Fixture School · Fixture Biology date and time', {
      exact: true,
    })
    await biology.focus()
    await expect(biology).toBeFocused()
    await biology.selectOption({ index: 1 })
    await expect(save).toContainText('1 date selected · not saved')
    await expect(page.getByText('Selected · not saved', { exact: true })).toBeVisible()
    await expect(biology.locator('option').nth(1)).not.toContainText('recommended')
    await page.getByText('1 teacher date selected across this workshop', { exact: true }).click()
    await expect(page.getByRole('button', { name: /Remove choice for/ })).toBeVisible()
    await page.getByRole('button', { name: /Remove choice for/ }).click()
    await expect(biology).toHaveValue('')
    await expect(save.getByRole('button', { name: 'Save dates', exact: true })).toBeDisabled()
    await biology.selectOption({ index: 1 })
    expect(await prisma.workshopSession.count()).toBe(0)
    expect(await prisma.assignment.count()).toBe(0)

    await biology.scrollIntoViewIfNeeded()
    await biology.focus()
    await page.keyboard.press('Tab')
    await expect(page.getByText('Individual slot staffing estimate', { exact: true })).toBeFocused()
    await expect
      .poll(async () => {
        const focused = await page
          .getByText('Individual slot staffing estimate', { exact: true })
          .boundingBox()
        const bar = await save.boundingBox()
        return Boolean(focused && bar && focused.y >= 0 && focused.y + focused.height <= bar.y)
      })
      .toBe(true)
    const saveBox = await save.boundingBox()
    expect(saveBox).not.toBeNull()
    expect(saveBox!.y).toBeGreaterThanOrEqual(0)
    expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(844)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations
    ).toEqual([])
    await page.screenshot({ path: `work/plan-hierarchy-${width}.png`, fullPage: true })
    await page.screenshot({ path: `work/plan-hierarchy-viewport-${width}.png` })

    await save.getByRole('button', { name: 'Save dates', exact: true }).click()
    await expect(page).toHaveURL(/step=plan&created=1/)
    expect(await prisma.workshopSession.count()).toBe(1)
    expect(await prisma.assignment.count()).toBe(0)
    await expect(page.getByLabel('Fixture School · Fixture Biology date and time')).toHaveCount(0)
    await page.getByText('Manage included teachers', { exact: true }).click()
    const included = page.getByRole('region', { name: 'Included teachers', exact: true })
    await expect(included.getByRole('link', { name: 'Staff session', exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Add teachers', exact: true }).click()
    await expect(page.locator('#add-classes')).toHaveAttribute('open', '')
    await expect(
      page.getByRole('button', { name: 'Add selected teachers', exact: true })
    ).toBeVisible()
  })
}
