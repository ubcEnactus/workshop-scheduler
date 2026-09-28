'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { adminSchema } from '@/lib/schemas/admins'

const DUPLICATE_EMAIL = 'That email is already in use by another account.'

function isDuplicateEmail(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

export async function createAdmin(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = adminSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    redirect(`/admin/admins?error=${encodeURIComponent(parsed.error.issues[0].message)}`)
  }

  try {
    await prisma.user.create({ data: { ...parsed.data, role: 'ADMIN' } })
  } catch (error) {
    if (isDuplicateEmail(error)) {
      redirect(`/admin/admins?error=${encodeURIComponent(DUPLICATE_EMAIL)}`)
    }
    throw error
  }

  revalidatePath('/admin/admins')
  redirect('/admin/admins?saved=1')
}
