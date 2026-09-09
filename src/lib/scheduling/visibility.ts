import type { Prisma } from '@prisma/client'
export const visibleWorkshop: Prisma.WorkshopWhereInput = {
  OR: [
    { status: 'PUBLISHED' },
    { status: { in: ['CANCELLED', 'COMPLETED'] }, publishedAt: { not: null } },
  ],
  classSection: { school: { deletedAt: null }, teacher: { deletedAt: null } },
}
