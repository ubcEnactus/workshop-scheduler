import { test, expect } from '@playwright/test'
import { prisma } from '../../src/lib/db'
import { resetFixtures, addCandidateFixture } from '../fixtures'
import { login } from './helpers'
test.afterAll(() => prisma.$disconnect())
test('plans explicit candidates for two named runs and preserves other run enrollment', async ({
  page,
}) => {
  const f = await resetFixtures()
  await prisma.classMeeting.deleteMany({
    where: { classSectionId: { in: [f.cls.id, f.sibling.id] } },
  })
  await login(page, f.admin.email, 'admin')
  for (const [month, day, number] of [
    ['2027-01', '04', 1],
    ['2027-02', '01', 3],
  ] as const) {
    const definitionId = `fixture-definition-${number}`
    await prisma.workshopDefinition.update({
      where: { id: definitionId },
      data: {
        deliveryStartsOn: new Date(`${month}-01T00:00:00.000Z`),
        deliveryEndsOn: new Date(`${month}-28T00:00:00.000Z`),
      },
    })
    await addCandidateFixture(f.cls.id, `${month}-${day}`, `fixture-definition-${number}`, 540, 600)
    await addCandidateFixture(
      f.sibling.id,
      `${month}-${day}`,
      `fixture-definition-${number}`,
      660,
      720
    )
    await addCandidateFixture(f.sibling.id, `${month}-${day}`, `fixture-definition-${number + 1}`)
    await page.goto(
      `/admin/workshops/plan?workshopDefinitionId=${definitionId}&week=${month}-${day}`
    )
    const candidates = page.getByRole('combobox', { name: /^Fixture School/ })
    await expect(candidates).toHaveCount(2)
    for (const candidate of await candidates.all()) await candidate.selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Save dates & continue', exact: true }).click()
    await expect(page).toHaveURL(/batch=/)
    expect(
      await prisma.workshopSession.count({
        where: { classWorkshop: { workshopDefinitionId: definitionId } },
      })
    ).toBe(2)
    expect(
      await prisma.classWorkshop.count({
        where: { workshopDefinitionId: `fixture-definition-${number + 1}` },
      })
    ).toBe(1)
  }
  expect(await prisma.workshopSession.count()).toBe(4)
})
