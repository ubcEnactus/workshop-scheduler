/**
 * Workshop Scheduler — seed
 *
 * Creates a minimal dataset so the team can sign in as each role on a fresh DB:
 *   - 1 admin
 *   - 2 schools (Lower Mainland)
 *   - 2 teachers (one per school)
 *   - 2 PAs
 *
 * Magic-link login works against any of these emails. In dev (no AUTH_RESEND_KEY)
 * the link is printed to the server console.
 *
 * Run: npm run db:seed
 */

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient, Role } from '../src/generated/prisma/client'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is not set. Aborting seed.')
  process.exit(1)
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

const SCHOOLS = [
  { name: 'Lord Byng Secondary', district: 'Vancouver' },
  { name: 'Burnaby Central Secondary', district: 'Burnaby' },
]

const ADMINS = [{ email: 'admin@workshopscheduler.local', name: 'Aria Admin' }]
const PAS = [
  { email: 'pa1@workshopscheduler.local', name: 'Priya Patel' },
  { email: 'pa2@workshopscheduler.local', name: 'Pat Chen' },
]
// Teachers: one per school, paired by index.
const TEACHERS = [
  { email: 'teacher1@workshopscheduler.local', name: 'Tomas Singh' },
  { email: 'teacher2@workshopscheduler.local', name: 'Tara Nguyen' },
]

async function main() {
  console.log('Seeding…')

  const schools = await Promise.all(
    SCHOOLS.map((s) =>
      prisma.school.upsert({
        where: { id: `seed-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` },
        update: { name: s.name, district: s.district },
        create: {
          id: `seed-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: s.name,
          district: s.district,
        },
      }),
    ),
  )

  const adminUsers = await Promise.all(
    ADMINS.map((a) =>
      prisma.user.upsert({
        where: { email: a.email },
        update: { role: Role.ADMIN, name: a.name },
        create: { email: a.email, name: a.name, role: Role.ADMIN },
      }),
    ),
  )

  const paUsers = await Promise.all(
    PAS.map((p) =>
      prisma.user.upsert({
        where: { email: p.email },
        update: { role: Role.PA, name: p.name },
        create: { email: p.email, name: p.name, role: Role.PA },
      }),
    ),
  )

  const teacherUsers = await Promise.all(
    TEACHERS.map((t, i) =>
      prisma.user.upsert({
        where: { email: t.email },
        update: {
          role: Role.TEACHER,
          name: t.name,
          schoolId: schools[i % schools.length].id,
        },
        create: {
          email: t.email,
          name: t.name,
          role: Role.TEACHER,
          schoolId: schools[i % schools.length].id,
        },
      }),
    ),
  )

  console.log('\nSeed complete. Sign in with any of these:\n')
  const rows = [
    ...adminUsers.map((u) => ({ role: 'ADMIN', email: u.email, name: u.name })),
    ...teacherUsers.map((u) => ({ role: 'TEACHER', email: u.email, name: u.name })),
    ...paUsers.map((u) => ({ role: 'PA', email: u.email, name: u.name })),
  ]
  console.table(rows)
  console.log(
    '\nNo AUTH_RESEND_KEY set? The magic-link URL will print to this terminal',
  )
  console.log('when you submit the login form. Click it to sign in.\n')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
