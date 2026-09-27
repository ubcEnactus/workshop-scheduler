import type { Prisma } from '@prisma/client'
export const visibleWorkshop: Prisma.WorkshopSessionWhereInput = {
  OR: [
    { status: 'PUBLISHED' },
    { status: { in: ['CANCELLED', 'COMPLETED'] }, publishedAt: { not: null } },
  ],
}
