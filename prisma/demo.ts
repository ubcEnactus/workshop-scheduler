import type { PrismaClient, ClassSection, User } from '@prisma/client'
import { shiftMonth, vancouverMonthKey, vancouverToUtc } from '../src/lib/time'

function plusDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}
function monday(month: string) {
  let date = `${month}-01`
  while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) date = plusDays(date, 1)
  return date
}

/** Called only by the guarded seed entry point against a disposable demo database. */
export async function seedRichDemo(
  db: PrismaClient,
  emails: { adminEmail: string; teacherEmail: string; paEmail: string }
) {
  const month = shiftMonth(vancouverMonthKey(), 1)
  const nextMonth = shiftMonth(month, 1)
  const finalMonth = shiftMonth(nextMonth, 1)
  const previousMonth = shiftMonth(vancouverMonthKey(), -1)
  const week = monday(month)
  // This is an explicit reset of the dedicated test/demo data, never a production seed.
  await db.$transaction([
    db.matchingPreview.deleteMany(),
    db.assignment.deleteMany(),
    db.workshopSession.deleteMany(),
    db.availabilitySlot.deleteMany(),
    db.classWorkshop.deleteMany(),
    db.workshopDefinition.deleteMany(),
    db.workshopBatch.deleteMany(),
    db.enrollmentBatch.deleteMany(),
    db.classSection.deleteMany(),
    db.availability.deleteMany(),
    db.availabilityScheduleVersion.deleteMany(),
    db.pAAvailabilityException.deleteMany(),
    db.monthlyPAQuota.deleteMany(),
    db.schoolClosure.deleteMany(),
    db.account.deleteMany(),
    db.session.deleteMany(),
    db.verificationToken.deleteMany(),
    db.user.deleteMany(),
    db.school.deleteMany(),
  ])
  await db.schedulingSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: { minimumGapDays: null, revision: 0 },
  })
  const admin = await db.user.create({
    data: { id: 'demo-admin', email: emails.adminEmail, name: 'Aria · Demo admin', role: 'ADMIN' },
  })
  await db.user.create({
    data: {
      id: 'demo-second-admin',
      email: 'second-admin@workshopscheduler.local',
      name: 'Morgan · Second admin',
      role: 'ADMIN',
    },
  })
  const schools = await Promise.all(
    ['Kitsilano Secondary', 'Burnaby Central Secondary', 'Richmond Secondary'].map((name, index) =>
      db.school.create({ data: { id: `demo-school-${index}`, name } })
    )
  )
  const teacherNames = [
    'Tomas Singh',
    'Tara Nguyen',
    'Amelia Brooks',
    'Noah Wilson',
    'Sofia Chen',
    'Liam Patel',
    'Ella Martin',
    'Oliver Lee',
    'Isla Ahmed',
    'Avery Chen',
  ]
  const teachers = await Promise.all(
    teacherNames.map((name, index) =>
      db.user.create({
        data: {
          id: `demo-teacher-${index}`,
          name,
          email: index === 0 ? emails.teacherEmail : `teacher${index + 1}@workshopscheduler.local`,
          role: 'TEACHER',
          schoolId: schools[index < 4 ? 0 : index < 7 ? 1 : 2].id,
        },
      })
    )
  )
  const classes: ClassSection[] = []
  for (let index = 0; index < 10; index++) {
    const schoolIndex = index < 4 ? 0 : index < 7 ? 1 : 2
    const teacherIndex = index
    const cls = await db.classSection.create({
      data: {
        id: `demo-class-${index}`,
        name: teachers[teacherIndex].name ?? teachers[teacherIndex].email,
        schoolId: schools[schoolIndex].id,
        teacherId: teachers[teacherIndex].id,
        grade: index % 3 === 0 ? '11' : '10',
        subject: 'Business & careers',
        defaultDurationMinutes: 60,
        defaultMinPAs: 1,
        defaultMaxPAs: 2,
      },
    })
    classes.push(cls)
    if (index !== 9)
      await db.classMeeting.createMany({
        data: (index === 8
          ? [{ dayOfWeek: 4, startMinute: 840, endMinute: 900 }]
          : [
              { dayOfWeek: index % 5, startMinute: 540, endMinute: 720 },
              { dayOfWeek: (index + 2) % 5, startMinute: 780, endMinute: 900 },
            ]
        ).map((block) => ({
          ...block,
          classSectionId: cls.id,
          effectiveFrom: new Date(`${previousMonth}-01`),
          activeForScheduling: true,
          notes: 'Teacher-confirmed weekly options for the demo.',
        })),
      })
  }
  const paNames = [
    'Priya Patel',
    'Pat Chen',
    'Alex Rivera',
    'Sam Taylor',
    'Jordan Kim',
    'Casey Wong',
    'Robin Singh',
    'Jamie Chen',
    'Avery Adams',
    'Riley Green',
    'Drew White',
    'Cameron Scott',
    'Morgan Yu',
    'Taylor Brown',
    'Quinn Davis',
    'Skyler Reed',
    'Charlie Park',
    'Emery Morgan',
  ]
  const pas: User[] = []
  for (let index = 0; index < paNames.length; index++) {
    const pa = await db.user.create({
      data: {
        id: `demo-pa-${index}`,
        name: paNames[index],
        email: index === 0 ? emails.paEmail : `demo-pa${index + 1}@workshopscheduler.local`,
        role: 'PA',
      },
    })
    pas.push(pa)
    if (index >= 16) continue
    const slots = []
    for (let day = 0; day < 5; day++) {
      if (index >= 8 && index % 5 !== day) continue
      const start = index < 8 ? 510 : 780
      const end = index < 8 ? 720 : day === 4 && index !== 14 ? 840 : 900
      for (let minute = start; minute < end; minute += 15)
        slots.push({
          userId: pa.id,
          dayOfWeek: day,
          startMin: minute,
          effectiveFrom: new Date(`${previousMonth}-01`),
        })
    }
    await db.availability.createMany({ data: slots })
    await db.availabilityScheduleVersion.create({
      data: { userId: pa.id, effectiveFrom: new Date(`${previousMonth}-01`) },
    })
  }
  const runs = await Promise.all(
    [
      {
        title: 'Entrepreneurship launch · completed pilot',
        start: `${previousMonth}-01`,
        end: `${previousMonth}-28`,
        description: 'An ended run with completed deliveries and one outstanding class.',
      },
      {
        title: 'Build a business',
        start: `${month}-01`,
        end: `${month}-23`,
        description:
          'Main demo run. Ten enrolled classes across three schools, with ready, unstaffed, exceptional and unscheduled examples.',
      },
      {
        title: 'Ideas that help our community',
        start: `${month}-15`,
        end: `${nextMonth}-13`,
        description: 'A cross-month run. Ten deliveries total, independent of calendar months.',
      },
      {
        title: 'Pitch lab',
        start: `${nextMonth}-02`,
        end: `${nextMonth}-20`,
        description: 'A fresh run to practice batch date planning and assignment.',
      },
      {
        title: 'Community challenge',
        start: `${nextMonth}-16`,
        end: `${finalMonth}-10`,
        description: 'An overlapping delivery window with shared PA capacity.',
      },
      {
        title: 'Showcase & reflection',
        start: `${finalMonth}-01`,
        end: `${finalMonth}-27`,
        description: 'A custom title with no required workshop number.',
      },
    ].map((run, index) =>
      db.workshopDefinition.create({
        data: {
          id: `demo-run-${index}`,
          title: run.title,
          description: run.description,
          durationMinutes: 60,
          defaultMinPAs: 1,
          defaultMaxPAs: 2,
          deliveryStartsOn: new Date(run.start),
          deliveryEndsOn: new Date(run.end),
        },
      })
    )
  )
  for (const [runIndex, run] of runs.entries())
    for (const [classIndex, cls] of classes.entries())
      await db.classWorkshop.create({
        data: {
          id: `demo-enrollment-${runIndex}-${classIndex}`,
          classSectionId: cls.id,
          workshopDefinitionId: run.id,
          notes:
            classIndex === 0
              ? 'Representative group: Entrepreneurship A and the visiting B group attend together. B has no separate class record or enrollment; this class represents the combined audience.'
              : null,
        },
      })
  await db.schoolClosure.create({
    data: {
      schoolId: schools[1].id,
      date: new Date(plusDays(week, 7)),
      notes: 'School professional development day · no visits.',
    },
  })
  await db.classAvailabilityException.create({
    data: {
      classSectionId: classes[2].id,
      date: new Date(plusDays(week, 2)),
      kind: 'CLOSED',
      startMinute: 780,
      endMinute: 900,
      notes: 'Teacher is at a staff meeting this afternoon.',
    },
  })

  async function session(input: {
    run: number
    cls: number
    date: string
    minute?: number
    status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED'
    pa?: number
    minPAs?: number
    locked?: boolean
    dateException?: string
    weeklyOverride?: boolean
    sameDayOverride?: boolean
  }) {
    const cls = classes[input.cls]
    const teacher = teachers.find((item) => item.id === cls.teacherId)!
    const school = schools.find((item) => item.id === cls.schoolId)!
    const start = vancouverToUtc(input.date, input.minute ?? 540),
      end = vancouverToUtc(input.date, (input.minute ?? 540) + 60)
    const id = `demo-session-${input.run}-${input.cls}`
    await db.availabilitySlot.create({
      data: {
        classWorkshopId: `demo-enrollment-${input.run}-${input.cls}`,
        start,
        end,
        notes: 'Specific teacher-confirmed demo date, scoped to this run.',
      },
    })
    const published = input.status !== 'DRAFT'
    const saved = await db.workshopSession.create({
      data: {
        id,
        classWorkshopId: `demo-enrollment-${input.run}-${input.cls}`,
        scheduledStart: start,
        scheduledEnd: end,
        status: input.status,
        minPAs: input.minPAs ?? 1,
        maxPAs: 2,
        locked: input.locked ?? published,
        hostingConfirmed: true,
        publishedAt: published ? new Date() : null,
        mode: 'IN_PERSON',
        location: `${school.name} · Room ${201 + input.cls}`,
        participantInstructions:
          'Check in at the school office 15 minutes early. Bring the workshop kit.',
        notes:
          input.cls === 0
            ? 'Admin-only note: combined audience is represented by this class. Confirm materials count externally.'
            : 'Demo scenario: inspect this session and its run coverage.',
        hostTeacherName: teacher.name,
        hostClassName: cls.name,
        hostSchoolName: school.name,
        ...(input.dateException
          ? {
              dateExceptionReason: input.dateException,
              dateExceptionApprovedBy: admin.id,
              dateExceptionApprovedAt: new Date(),
            }
          : {}),
        ...(input.pa === undefined
          ? {}
          : {
              assignments: {
                create: {
                  paId: pas[input.pa].id,
                  status: published ? 'PUBLISHED' : 'DRAFT',
                  source:
                    input.locked || input.weeklyOverride || input.sameDayOverride
                      ? 'MANUAL'
                      : 'AUTOMATIC',
                  overrideWeek: input.weeklyOverride ?? false,
                  overrideSameDay: input.sameDayOverride ?? false,
                  overrideReason:
                    input.weeklyOverride || input.sameDayOverride
                      ? 'Admin confirmed additional demo capacity with this PA.'
                      : null,
                },
              },
            }),
      },
    })
    await db.classWorkshop.update({
      where: { id: saved.classWorkshopId },
      data: { status: input.status === 'COMPLETED' ? 'COMPLETED' : 'SCHEDULED' },
    })
    if (published) {
      const state = {
        schemaVersion: 2,
        status: input.status,
        start: start.toISOString(),
        end: end.toISOString(),
        minPAs: saved.minPAs,
        maxPAs: saved.maxPAs,
        mode: saved.mode,
        location: saved.location,
        participantInstructions: saved.participantInstructions,
        pas: input.pa === undefined ? [] : [{ id: pas[input.pa].id, name: pas[input.pa].name! }],
      }
      await db.workshopEvent.create({
        data: {
          workshopSessionId: id,
          actorId: admin.id,
          actorName: admin.name!,
          kind: 'PUBLISH',
          reason: 'Demo workshop publication',
          before: { ...state, status: 'DRAFT' },
          after: state,
          wasPublished: true,
          affectedPAIds: input.pa === undefined ? [] : [pas[input.pa].id],
          ...(input.status === 'COMPLETED'
            ? {
                communicatedAt: new Date(),
                communicatedById: admin.id,
                communicationNote: 'Teacher and PA confirmed for the previous pilot.',
              }
            : {}),
        },
      })
    }
    return saved
  }
  for (let index = 0; index < 8; index++)
    await session({
      run: 0,
      cls: index,
      date: plusDays(monday(previousMonth), index < 5 ? index : index + 2),
      status: 'COMPLETED',
      pa: index < 3 ? 0 : index - 1,
    })
  await db.classWorkshop.update({
    where: { id: 'demo-enrollment-0-8' },
    data: {
      status: 'WAIVED',
      waiverReason: 'Joined the program after this run ended.',
      waivedById: admin.id,
      waivedAt: new Date(),
    },
  })
  await session({ run: 1, cls: 0, date: week, status: 'PUBLISHED', pa: 0 })
  await session({ run: 1, cls: 1, date: plusDays(week, 1), status: 'DRAFT', pa: 1, locked: true })
  await session({ run: 1, cls: 2, date: plusDays(week, 2), status: 'DRAFT' })
  await session({ run: 1, cls: 3, date: plusDays(week, 3), status: 'PUBLISHED', pa: 2 })
  await session({
    run: 1,
    cls: 8,
    date: plusDays(week, 4),
    minute: 840,
    status: 'DRAFT',
    minPAs: 2,
  })
  const makeup = plusDays(week, 28)
  await session({
    run: 1,
    cls: 5,
    date: makeup,
    status: 'PUBLISHED',
    pa: 3,
    dateException: 'Teacher confirmed this makeup after the shared delivery window.',
  })
  await session({
    run: 2,
    cls: 6,
    date: plusDays(makeup, 1),
    status: 'DRAFT',
    pa: 3,
    locked: true,
    weeklyOverride: true,
  })
  await session({
    run: 2,
    cls: 4,
    date: makeup,
    minute: 660,
    status: 'DRAFT',
    pa: 3,
    locked: true,
    weeklyOverride: true,
    sameDayOverride: true,
  })
  await db.pAAvailabilityException.create({
    data: {
      userId: pas[0].id,
      date: new Date(week),
      kind: 'UNAVAILABLE',
      notes: 'Demo: availability changed after publication; admin must replace this PA.',
    },
  })
  await db.availabilityScheduleVersion.create({
    data: { userId: pas[15].id, effectiveFrom: new Date(`${nextMonth}-01`) },
  })
  await db.availability.updateMany({
    where: { userId: pas[15].id },
    data: { effectiveUntil: new Date(plusDays(`${nextMonth}-01`, -1)) },
  })
  await db.availabilityScheduleVersion.updateMany({
    where: { userId: pas[15].id, effectiveFrom: { lt: new Date(`${nextMonth}-01`) } },
    data: { effectiveUntil: new Date(plusDays(`${nextMonth}-01`, -1)) },
  })
  console.log(
    `Rich demo ready: 3 schools, 10 classes, 6 runs, 60 enrollments and 18 PAs. Start at /admin/workshop-definitions/demo-run-1 or /admin/workshops?month=${month}`
  )
}
