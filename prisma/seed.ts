import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

const SCHOOLS = [
  { name: 'Lord Byng Secondary', district: 'Vancouver' },
  { name: 'Burnaby Central Secondary', district: 'Burnaby' },
]

const ADMINS = [{ email: 'admin@workshopscheduler.local', name: 'Aria Admin' }]
const PAS = [
  { email: 'pa1@workshopscheduler.local', name: 'Priya Patel' },
  { email: 'pa2@workshopscheduler.local', name: 'Pat Chen' },
]
const TEACHERS = [
  { email: 'teacher1@workshopscheduler.local', name: 'Tomas Singh' },
  { email: 'teacher2@workshopscheduler.local', name: 'Tara Nguyen' },
]

const CLASSES = [
  {
    name: 'Block A Biology 11',
    subject: 'Biology',
    grade: '11',
    dayOfWeek: 1,
    startMinute: 600,
    endMinute: 660,
  },
  {
    name: 'Block C Math 10',
    subject: 'Math',
    grade: '10',
    dayOfWeek: 2,
    startMinute: 780,
    endMinute: 870,
  },
]

function slugId(prefix: string, name: string): string {
  return `${prefix}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function ticks(dayOfWeek: number, startMin: number, endMin: number) {
  return Array.from({ length: (endMin - startMin) / 30 }, (_, index) => ({
    dayOfWeek,
    startMin: startMin + index * 30,
  }))
}

async function main() {
  console.log('Seeding core demo data…')

  const schools = await Promise.all(
    SCHOOLS.map((school) =>
      prisma.school.upsert({
        where: { id: slugId('seed', school.name) },
        update: { ...school, deletedAt: null },
        create: { id: slugId('seed', school.name), ...school },
      })
    )
  )

  const admins = await Promise.all(
    ADMINS.map((admin) =>
      prisma.user.upsert({
        where: { email: admin.email },
        update: { name: admin.name, role: Role.ADMIN, deletedAt: null },
        create: { ...admin, role: Role.ADMIN },
      })
    )
  )

  const pas = await Promise.all(
    PAS.map((pa) =>
      prisma.user.upsert({
        where: { email: pa.email },
        update: { name: pa.name, role: Role.PA, schoolId: null, deletedAt: null },
        create: { ...pa, role: Role.PA },
      })
    )
  )

  const teachers = await Promise.all(
    TEACHERS.map((teacher, index) =>
      prisma.user.upsert({
        where: { email: teacher.email },
        update: {
          name: teacher.name,
          role: Role.TEACHER,
          schoolId: schools[index % schools.length].id,
          deletedAt: null,
        },
        create: {
          ...teacher,
          role: Role.TEACHER,
          schoolId: schools[index % schools.length].id,
        },
      })
    )
  )

  for (let index = 0; index < teachers.length; index++) {
    const teacher = teachers[index]
    const definition = CLASSES[index % CLASSES.length]
    const classId = slugId('seed-class', `${teacher.email}-${definition.name}`)
    const meetingId = slugId('seed-meeting', classId)

    await prisma.classSection.upsert({
      where: { id: classId },
      update: {
        name: definition.name,
        subject: definition.subject,
        grade: definition.grade,
        teacherId: teacher.id,
        schoolId: schools[index % schools.length].id,
      },
      create: {
        id: classId,
        name: definition.name,
        subject: definition.subject,
        grade: definition.grade,
        teacherId: teacher.id,
        schoolId: schools[index % schools.length].id,
      },
    })

    await prisma.classMeeting.upsert({
      where: { id: meetingId },
      update: {
        classSectionId: classId,
        dayOfWeek: definition.dayOfWeek,
        startMinute: definition.startMinute,
        endMinute: definition.endMinute,
      },
      create: {
        id: meetingId,
        classSectionId: classId,
        dayOfWeek: definition.dayOfWeek,
        startMinute: definition.startMinute,
        endMinute: definition.endMinute,
      },
    })
  }

  const availability = [[...ticks(1, 570, 690), ...ticks(2, 780, 900)], ticks(1, 570, 690)]

  for (let index = 0; index < pas.length; index++) {
    await prisma.$transaction([
      prisma.availability.deleteMany({ where: { userId: pas[index].id } }),
      prisma.availability.createMany({
        data: availability[index].map((slot) => ({ userId: pas[index].id, ...slot })),
      }),
    ])
  }

  console.log('\nSeed complete. Use one of these invited accounts:\n')
  console.table([
    ...admins.map((user) => ({ role: 'ADMIN', email: user.email, name: user.name })),
    ...teachers.map((user) => ({ role: 'TEACHER', email: user.email, name: user.name })),
    ...pas.map((user) => ({ role: 'PA', email: user.email, name: user.name })),
  ])
  console.log('\nWithout AUTH_RESEND_KEY, magic links print in the dev server terminal.\n')
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
