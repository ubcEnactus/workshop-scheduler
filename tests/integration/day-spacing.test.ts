import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { prisma } from '../../src/lib/db'
import { assessAssignment } from '../../src/lib/scheduling/eligibility'
import { loadSchedule } from '../../src/lib/scheduling/store'
import { vancouverToUtc } from '../../src/lib/time'
import { createSessionFixture, resetFixtures } from '../fixtures'

let f: Awaited<ReturnType<typeof resetFixtures>>

beforeEach(async () => {
  f = await resetFixtures()
  await prisma.availability.createMany({
    data: [0, 1, 2, 3, 4].flatMap((dayOfWeek) =>
      Array.from({ length: 24 }, (_, index) => ({
        userId: f.pa.id,
        dayOfWeek,
        startMin: 540 + index * 15,
      }))
    ),
  })
})

afterAll(() => prisma.$disconnect())

async function otherClass() {
  return prisma.classSection.create({
    data: {
      name: 'Other school class',
      teacherId: f.otherTeacher.id,
      schoolId: f.otherSchool.id,
    },
  })
}

async function session(classSectionId: string, date: string, startMinute = 600) {
  return createSessionFixture({
    data: {
      classSectionId,
      scheduledStart: vancouverToUtc(date, startMinute),
      scheduledEnd: vancouverToUtc(date, startMinute + 60),
      minPAs: 1,
      maxPAs: 1,
    },
  })
}

async function assessmentFor(existingDate: string, targetDate: string, targetStart = 600) {
  const other = await otherClass()
  const existing = await session(other.id, existingDate)
  await prisma.assignment.create({
    data: { workshopSessionId: existing.id, paId: f.pa.id, source: 'MANUAL' },
  })
  const target = await session(f.cls.id, targetDate, targetStart)
  const snapshot = await loadSchedule(prisma)
  return assessAssignment(
    snapshot,
    snapshot.workshops.find((workshop) => workshop.id === target.id)!,
    f.pa.id
  )
}

describe('Vancouver workload policy', () => {
  it('requires a weekly override for two different weekdays in one Monday-Friday week', async () => {
    const assessment = await assessmentFor('2027-01-04', '2027-01-05')
    expect(assessment.hardErrors).toEqual([])
    expect(assessment.automaticEligible).toBe(false)
    expect(assessment.manualEligible).toBe(true)
    expect(assessment.manualWarnings.map((warning) => warning.code)).toEqual(['SAME_WEEK'])
  })

  it('resets the automatic weekly allowance on the following Monday', async () => {
    const assessment = await assessmentFor('2027-01-08', '2027-01-11')
    expect(assessment.hardErrors).toEqual([])
    expect(assessment.manualWarnings).toEqual([])
    expect(assessment.automaticEligible).toBe(true)
  })

  it('shows both red same-day and amber same-week warnings for a second nonoverlapping day visit', async () => {
    const assessment = await assessmentFor('2027-01-04', '2027-01-04', 780)
    expect(assessment.hardErrors).toEqual([])
    expect(assessment.manualEligible).toBe(true)
    expect(assessment.manualWarnings.map((warning) => warning.code)).toEqual([
      'SAME_DAY',
      'SAME_WEEK',
    ])
  })

  it('ignores legacy monthly quotas while retaining lifetime assignments for fairness', async () => {
    await prisma.monthlyPAQuota.create({
      data: { paId: f.pa.id, month: '2027-01', quota: 0 },
    })
    const assessment = await assessmentFor('2027-01-08', '2027-01-11')
    expect(assessment.automaticEligible).toBe(true)
    expect(assessment.totalAssignments).toBe(1)
    expect(JSON.stringify(assessment)).not.toContain('quota')
  })

  it('excludes cancelled commitments from workload limits and fairness totals', async () => {
    const other = await otherClass()
    const existing = await session(other.id, '2027-01-04')
    await prisma.assignment.create({
      data: { workshopSessionId: existing.id, paId: f.pa.id, source: 'MANUAL' },
    })
    await prisma.workshopSession.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
    })
    const target = await session(f.cls.id, '2027-01-05')
    const snapshot = await loadSchedule(prisma)
    const assessment = assessAssignment(
      snapshot,
      snapshot.workshops.find((workshop) => workshop.id === target.id)!,
      f.pa.id
    )
    expect(assessment.automaticEligible).toBe(true)
    expect(assessment.totalAssignments).toBe(0)
  })
})
