'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { paIdSchema, paSchema } from '@/lib/schemas/pas'

const DUPLICATE_EMAIL = 'That email is already in use by another account.'

function isDuplicateEmail(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function createPA(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = paSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    redirect(`/admin/pas?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }

  try {
    await prisma.user.create({ data: { ...parsed.data, role: 'PA' } })
  } catch (error) {
    if (isDuplicateEmail(error)) {
      redirect(`/admin/pas?error=${encodeURIComponent(DUPLICATE_EMAIL)}`)
    }
    throw error
  }

  revalidatePath('/admin/pas')
}

export async function updatePA(formData: FormData) {
  await requireRole('ADMIN')
  const id = paIdSchema.safeParse({ id: formData.get('id') })
  if (!id.success) redirect('/admin/pas?error=Unknown+PA.')

  const parsed = paSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    redirect(
      `/admin/pas/${id.data.id}/edit?error=${encodeURIComponent(parsed.error.issues[0].message)}`
    )
  }

  try {
    await prisma.user.update({
      where: { id: id.data.id, role: 'PA', deletedAt: null },
      data: parsed.data,
    })
  } catch (error) {
    if (isDuplicateEmail(error)) {
      redirect(`/admin/pas/${id.data.id}/edit?error=${encodeURIComponent(DUPLICATE_EMAIL)}`)
    }
    throw error
  }

  redirect('/admin/pas')
}

export async function softDeletePA(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = paIdSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect('/admin/pas?error=Unknown+PA.')

  const futureAssignment = await prisma.assignment.findFirst({
    where: {
      paId: parsed.data.id,
      status: 'CONFIRMED',
      workshop: {
        scheduledStart: { gte: new Date() },
        status: { notIn: ['CANCELLED', 'COMPLETED'] },
      },
    },
    select: { id: true },
  })
  if (futureAssignment) {
    redirect('/admin/pas?error=Replace+this+PA%27s+future+assignments+before+removing+them.')
  }

  await prisma.user.update({
    where: { id: parsed.data.id, role: 'PA', deletedAt: null },
    data: { deletedAt: new Date() },
  })
  revalidatePath('/admin/pas')
}
