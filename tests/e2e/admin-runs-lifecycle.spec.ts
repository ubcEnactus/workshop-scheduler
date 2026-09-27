import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { prisma } from '../../src/lib/db'
import { vancouverToUtc } from '../../src/lib/time'
import { resetFixtures } from '../fixtures'
import { login } from './helpers'

test.afterAll(() => prisma.$disconnect())

test('creates a workshop, adds its first class, and exposes the connected workflow', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  const longClassName = 'Grade 10 Community Entrepreneurship and Leadership'
  await Promise.all([
    prisma.classSection.update({
      where: { id: fixture.cls.id },
      data: { name: longClassName },
    }),
    prisma.school.update({
      where: { id: fixture.school.id },
      data: { name: 'Burnaby Central Community Secondary School' },
    }),
  ])
  await login(page, fixture.admin.email, 'admin')

  await page.goto('/admin/workshop-definitions')
  await expect(page.locator('#create-workshop')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Create a workshop', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Create a workshop', exact: true })).toHaveCount(0)
  const createTrigger = page.getByRole('link', { name: 'Create a workshop', exact: true })
  await expect(createTrigger).toHaveAttribute(
    'href',
    '/admin/workshop-definitions?create=1#create-workshop'
  )
  await createTrigger.click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\?create=1#create-workshop$/)
  await expect(page.getByRole('heading', { name: 'Create a workshop' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Create a workshop' })).toBeVisible()
  await page.locator('#create-workshop').getByLabel('Workshop title').fill('Discarded draft')
  await page.getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions$/)
  await expect(page.locator('#create-workshop')).toHaveCount(0)
  expect(await prisma.workshopDefinition.count({ where: { title: 'Discarded draft' } })).toBe(0)
  await page.goto('/admin')
  await page.getByRole('link', { name: 'Create a workshop', exact: true }).first().click()
  await expect(page).toHaveURL(/\/admin\/workshop-definitions\?create=1#create-workshop$/)
  const create = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Create a workshop' }) })
  await expect(create.getByLabel('Workshop title')).toHaveValue('')
  await create.getByLabel('Workshop title').fill('Fall Makers Lab')
  await create.getByLabel('Delivery starts').fill('2027-01-04')
  await create.getByLabel('Delivery ends').fill('2027-01-29')
  await create.getByRole('button', { name: 'Create a workshop' }).click()

  await expect(page).toHaveURL(/\/admin\/workshop-definitions\/[^?]+\?created=1/)
  await expect(page.getByRole('heading', { name: 'Fall Makers Lab' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(
    'Workshop created. Add the teachers that should receive it.'
  )
  const run = await prisma.workshopDefinition.findFirstOrThrow({
    where: { title: 'Fall Makers Lab' },
  })

  const workflow = page.getByRole('navigation', { name: 'Workshop workflow' })
  await expect(workflow.getByRole('link', { name: '1. Plan', exact: true })).toHaveAttribute(
    'href',
    `/admin/workshop-definitions/${run.id}?step=plan`
  )
  await expect(workflow.getByRole('link', { name: '2. Staff', exact: true })).toHaveAttribute(
    'href',
    `/admin/workshop-definitions/${run.id}?step=staff`
  )
  await expect(workflow.getByRole('link', { name: '3. Publish', exact: true })).toHaveAttribute(
    'href',
    `/admin/workshop-definitions/${run.id}?step=publish`
  )
  await page.goto(
    `/admin/workshops?workshopDefinitionId=${run.id}&batch=unused-batch&week=2027-01-04`
  )
  const globalCalendarHref = await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Calendar', exact: true })
    .getAttribute('href')
  const globalCalendar = new URL(globalCalendarHref!, 'http://localhost')
  expect(globalCalendar.searchParams.has('workshopDefinitionId')).toBe(false)
  expect(globalCalendar.searchParams.has('batch')).toBe(false)
  expect(globalCalendar.searchParams.has('week')).toBe(false)
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Workshops', exact: true })
  ).toHaveAttribute('aria-current', 'page')

  await page.goto(`/admin/workshop-definitions/${run.id}`)
  await page.getByRole('checkbox', { name: new RegExp(longClassName) }).check()
  await page.getByRole('button', { name: 'Add selected teachers' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Teachers added.' })).toContainText(
    '1 new teacher included'
  )
  const classPicker = page.locator('#add-classes')
  await expect(classPicker).not.toHaveAttribute('open', '')
  await classPicker.locator('summary').click()
  await expect(page.getByRole('button', { name: 'Add selected teachers' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Saving…' })).toHaveCount(0)
  await page.getByText('Manage included teachers', { exact: true }).click()
  const classHref = new URL(
    (await page.getByRole('link', { name: longClassName, exact: true }).getAttribute('href'))!,
    'http://localhost'
  )
  expect(classHref.pathname).toBe(`/admin/classes/${fixture.cls.id}`)
  expect(Object.fromEntries(classHref.searchParams)).toEqual({
    classSectionId: fixture.cls.id,
    workshopDefinitionId: run.id,
    week: '2027-01-04',
  })
  expect(
    await prisma.classWorkshop.count({
      where: { workshopDefinitionId: run.id, classSectionId: fixture.cls.id },
    })
  ).toBe(1)

  await page.setViewportSize({ width: 390, height: 844 })
  const included = page.getByRole('region', { name: 'Included teachers', exact: true })
  await expect(included.getByRole('link', { name: longClassName, exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await included.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true
  )
  expect(
    await included
      .locator('article')
      .first()
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations
  ).toEqual([])

  await page.goto(
    `/admin/workshop-definitions/enroll?runIds=${run.id}&classSectionIds=${fixture.cls.id}`
  )
  await expect(page.getByRole('heading', { name: '2. Review teachers by workshop' })).toBeVisible()
  await expect(page.getByText('Already included · unchanged', { exact: true })).toBeVisible()
})

test('prioritizes classes that can advance while keeping setup blockers visible', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  await prisma.classMeeting.deleteMany({ where: { classSectionId: fixture.cls.id } })
  const run = await prisma.workshopDefinition.create({
    data: {
      title: 'Mixed readiness workshop',
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-15T00:00:00.000Z'),
      classWorkshops: {
        create: [{ classSectionId: fixture.cls.id }, { classSectionId: fixture.sibling.id }],
      },
    },
  })
  await login(page, fixture.admin.email, 'admin')

  await page.goto(`/admin/workshop-definitions/${run.id}`)
  await expect(
    page.getByRole('heading', { name: 'Choose a date and time for each teacher', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: '1. Plan', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  )
  const included = page.getByRole('region', { name: 'Included teachers', exact: true })
  await page.getByText('Manage included teachers', { exact: true }).click()
  const ready = included.locator('article').first()
  await expect(ready).toContainText(fixture.sibling.name)
  await expect(ready.getByText('Needs a date', { exact: true })).toBeVisible()
  await expect(
    ready.getByRole('link', { name: 'Choose a teacher date', exact: true })
  ).toHaveAttribute('href', new RegExp(`step=plan.*classSectionId=${fixture.sibling.id}`))
  const blocked = included.locator('article').filter({ hasText: fixture.cls.name })
  await expect(blocked.getByText('Needs teacher availability', { exact: true })).toBeVisible()
  await expect(
    blocked.getByRole('link', { name: 'Add teacher availability', exact: true })
  ).toBeVisible()
})

test('distinguishes a missing teacher contact from missing class availability', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  const run = await prisma.workshopDefinition.create({
    data: {
      title: 'Teacher review workshop',
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-15T00:00:00.000Z'),
      classWorkshops: { create: { classSectionId: fixture.cls.id } },
    },
  })
  await prisma.user.update({ where: { id: fixture.teacher.id }, data: { deletedAt: new Date() } })
  await login(page, fixture.admin.email, 'admin')

  await page.goto(`/admin/workshop-definitions/${run.id}`)
  await page.getByText('Manage included teachers', { exact: true }).click()
  const row = page
    .getByRole('region', { name: 'Included teachers', exact: true })
    .locator('article')
    .filter({ hasText: fixture.cls.name })
  await expect(row.getByText('Teacher contact needs review', { exact: true })).toBeVisible()
  await expect(row.getByRole('link', { name: 'Review teacher contact' })).toHaveAttribute(
    'href',
    new RegExp(`#teacher-contact$`)
  )
  await expect(row.getByRole('link', { name: 'Add teacher availability' })).toHaveCount(0)
})

test('keeps a published staffing deficit visible and repairable in the workshop workspace', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  const run = await prisma.workshopDefinition.create({
    data: {
      title: 'Published deficit workshop',
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-15T00:00:00.000Z'),
      classWorkshops: { create: { classSectionId: fixture.cls.id } },
    },
    include: { classWorkshops: true },
  })
  const session = await prisma.workshopSession.create({
    data: {
      classWorkshopId: run.classWorkshops[0].id,
      scheduledStart: vancouverToUtc('2027-01-04', 600),
      scheduledEnd: vancouverToUtc('2027-01-04', 660),
      minPAs: 2,
      maxPAs: 3,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      assignments: { create: { paId: fixture.pa.id, status: 'PUBLISHED' } },
    },
  })
  await login(page, fixture.admin.email, 'admin')

  await page.goto(`/admin/workshop-definitions/${run.id}`)
  await page.getByText('Manage included teachers', { exact: true }).click()
  const published = page.getByText('Published sessions (1)', { exact: true }).locator('..')
  await expect(published).toHaveAttribute('open', '')
  await expect(published.getByText('Published · needs 1 PA', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Manage published session', exact: true })
  ).toHaveAttribute('href', `/admin/workshops/${session.id}`)
  await expect(
    published.getByRole('link', { name: 'Record communication / manage changes', exact: true })
  ).toHaveAttribute('href', `/admin/workshops/${session.id}#communication`)
})

test('routes a window-ended class to delivery review instead of adding availability', async ({
  page,
}) => {
  const fixture = await resetFixtures()
  const run = await prisma.workshopDefinition.create({
    data: {
      title: 'Ended workshop',
      deliveryStartsOn: new Date('2026-08-03T00:00:00.000Z'),
      deliveryEndsOn: new Date('2026-08-07T00:00:00.000Z'),
      classWorkshops: { create: { classSectionId: fixture.cls.id } },
    },
    include: { classWorkshops: true },
  })
  await login(page, fixture.admin.email, 'admin')

  await page.goto(`/admin/workshop-definitions/${run.id}`)
  await expect(
    page.getByText(/The delivery window has ended\. 1 class still need a delivery decision\./)
  ).toBeVisible()
  await page.getByText('Manage included teachers', { exact: true }).click()
  const row = page
    .getByRole('region', { name: 'Included teachers', exact: true })
    .locator('article')
    .filter({ hasText: fixture.cls.name })
  await expect(row.getByRole('link', { name: 'Review outstanding delivery' })).toHaveAttribute(
    'href',
    `/admin/class-workshops/${run.classWorkshops[0].id}`
  )
  await expect(row.getByRole('link', { name: 'Add teacher availability' })).toHaveCount(0)
  await expect(row.locator('summary')).toHaveAccessibleName('Teacher details and options')
})

test('shows recurring class blocks as run-planning date choices', async ({ page }) => {
  const fixture = await resetFixtures()
  const run = await prisma.workshopDefinition.create({
    data: {
      title: 'Recurring planning run',
      deliveryStartsOn: new Date('2027-01-04T00:00:00.000Z'),
      deliveryEndsOn: new Date('2027-01-15T00:00:00.000Z'),
      durationMinutes: 60,
      classWorkshops: { create: { classSectionId: fixture.cls.id } },
    },
  })
  await login(page, fixture.admin.email, 'admin')

  await page.goto(`/admin/workshops/plan?workshopDefinitionId=${run.id}&week=2027-01-04`)
  const choices = page.getByLabel('Fixture School · Fixture Biology date and time')
  await expect(choices).toBeVisible()
  expect(await choices.locator('option').count()).toBeGreaterThan(1)
  await expect(choices.locator('option').nth(1)).toContainText('Jan')
})
