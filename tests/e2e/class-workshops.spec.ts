import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { resetFixtures, addCandidateFixture } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())
test('records per-workshop candidates, schedules a session, assigns and publishes it', async ({
  page,
  browser,
}) => {
  const f = await resetFixtures()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-15T00:00:00.000Z'),
    },
  })
  await prisma.availability.createMany({
    data: [600, 615, 630, 645].map((startMin) => ({
      userId: f.pa.id,
      dayOfWeek: 0,
      startMin,
    })),
  })
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/classes/' + f.cls.id + '?tab=workshops')
  const addWorkshopForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add workshop to teacher' }) })
  await addWorkshopForm
    .locator('select[name="workshopDefinitionId"]')
    .selectOption('fixture-definition-1')
  await addWorkshopForm.getByRole('button', { name: 'Add workshop to teacher' }).click()
  await page.getByRole('link', { name: 'Workshop details & history' }).click()
  await expect(
    page.getByRole('heading', { name: 'Workshop 1', exact: true, level: 1 })
  ).toBeVisible()
  await expect(page.getByText('Ready to schedule', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Choose a teacher date' })).toHaveAttribute(
    'href',
    /workshopDefinitionId=fixture-definition-1/
  )
  const cwUrl = page.url()
  for (const date of ['2027-01-04', '2027-01-11']) {
    const form = page
      .locator('form')
      .filter({ has: page.getByRole('button', { name: 'Add availability', exact: true }) })
    await form.getByLabel('Date', { exact: true }).fill(date)
    await form.getByLabel('Start time', { exact: true }).fill('10:00')
    await form.getByLabel('End time', { exact: true }).fill('11:00')
    await form.getByRole('button', { name: 'Add availability', exact: true }).click()
    await expect(page.locator('article')).toHaveCount(date === '2027-01-04' ? 1 : 2)
    await expect(page.getByText('Ready to schedule', { exact: true })).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: /Jan 4/ })).toBeVisible()
  await page.locator('article').first().getByText('Edit availability', { exact: true }).click()
  const edit = page
    .locator('article')
    .first()
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Save availability', exact: true }) })
  await edit.getByLabel('Notes', { exact: true }).fill('Confirmed by teacher')
  await edit.getByRole('button', { name: 'Save availability' }).click()
  await expect(
    page.getByRole('paragraph').filter({ hasText: 'Confirmed by teacher' })
  ).toBeVisible()
  await page.locator('article').last().getByRole('button', { name: 'Remove availability' }).click()
  await expect(page.locator('article')).toHaveCount(1)
  await page.goto('/admin/classes/' + f.cls.id + '?tab=workshops')
  const addSecondWorkshopForm = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Add workshop to teacher' }) })
  await addSecondWorkshopForm
    .locator('select[name="workshopDefinitionId"]')
    .selectOption('fixture-definition-2')
  await addSecondWorkshopForm.getByRole('button', { name: 'Add workshop to teacher' }).click()
  await page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Workshop 2', exact: true }) })
    .getByRole('link', { name: 'Workshop details & history' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Workshop 2', exact: true, level: 1 })
  ).toBeVisible()
  await expect(page.getByText('No candidate times recorded yet.')).toBeVisible()
  await page.goto(cwUrl)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'work/class-workshop-mobile.png', fullPage: true })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByText('Schedule this time', { exact: true }).click()
  const savedCandidate = page.locator('article').filter({ hasText: 'Schedule this time' })
  await savedCandidate.getByLabel('Location').fill('Room 12')
  await savedCandidate.getByLabel('Session notes').fill('Bring the workshop materials.')
  await savedCandidate.getByRole('button', { name: 'Create draft session' }).click()
  await expect(page.getByRole('status')).toHaveText('Draft saved.')
  await expect(page.getByText('Room 12', { exact: true })).toBeVisible()
  await expect(page.getByText('Internal admin notes: Bring the workshop materials.')).toBeVisible()
  const session = await prisma.workshopSession.findFirstOrThrow()
  await page.getByRole('button', { name: 'Assign Fixture PA', exact: true }).click()
  await page.getByRole('button', { name: 'Publish session', exact: true }).click()
  await expect(page.getByText('Status: published', { exact: true })).toBeVisible()
  expect(await prisma.assignment.findFirstOrThrow()).toMatchObject({
    workshopSessionId: session.id,
    paId: f.pa.id,
    status: 'PUBLISHED',
  })
  await page.goto('/admin/classes/' + f.cls.id + '?tab=workshops')
  await expect(page.getByText('Published', { exact: true })).toBeVisible()
  await expect(page.getByText('Needs availability', { exact: true })).toBeVisible()
  const teacher = await browser.newPage()
  await login(teacher, f.teacher.email, 'teacher')
  await expect(teacher.getByText('Workshop 1', { exact: true })).toBeVisible()
  await expect(teacher.getByText('Room 12', { exact: true })).toBeVisible()
  await expect(teacher.getByText('Workshop 2', { exact: true })).toHaveCount(0)
  await teacher.close()
})
test('run planning selects explicit candidates and leaves the other workshop untouched', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.workshopDefinition.update({
    where: { id: 'fixture-definition-1' },
    data: {
      deliveryStartsOn: new Date('2027-01-01T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-31T00:00:00.000Z'),
    },
  })
  await addCandidateFixture(f.cls.id, '2027-01-04')
  await addCandidateFixture(f.cls.id, '2027-01-11', 'fixture-definition-2')
  await login(page, f.admin.email, 'admin')
  await page.goto('/admin/workshops/plan?workshopDefinitionId=fixture-definition-1&week=2027-01-04')
  await page
    .getByLabel('Fixture School · Fixture Biology date and time', { exact: true })
    .selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
  await expect(page).toHaveURL(/batch=/)
  expect(await prisma.workshopSession.count()).toBe(1)
  expect(
    (
      await prisma.classWorkshop.findUniqueOrThrow({
        where: {
          classSectionId_workshopDefinitionId: {
            classSectionId: f.cls.id,
            workshopDefinitionId: 'fixture-definition-2',
          },
        },
      })
    ).status
  ).toBe('READY_TO_SCHEDULE')
})
