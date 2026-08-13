'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { classSectionSchema, classSectionIdSchema, classMeetingSchema } from '@/lib/schemas/classes'
import { z } from 'zod'

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export async function createClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classSectionSchema.parse({
    name: formData.get('name'),
    subject: formData.get('subject') || undefined,
    grade: formData.get('grade') || undefined,
    teacherId: formData.get('teacherId'),
    schoolId: formData.get('schoolId'),
  })
  await prisma.classSection.create({ data: parsed })
  revalidatePath('/admin/classes')
}

export async function updateClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = classSectionIdSchema.parse({ id: formData.get('id') })
  const parsed = classSectionSchema.parse({
    name: formData.get('name'),
    subject: formData.get('subject') || undefined,
    grade: formData.get('grade') || undefined,
    teacherId: formData.get('teacherId'),
    schoolId: formData.get('schoolId'),
  })
  await prisma.classSection.update({ where: { id }, data: parsed })
  redirect('/admin/classes')
}

export async function deleteClassSection(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = classSectionIdSchema.parse({ id: formData.get('id') })
  await prisma.classSection.delete({ where: { id } })
  revalidatePath('/admin/classes')
}

export async function addMeeting(formData: FormData) {
  await requireRole('ADMIN')
  const parsed = classMeetingSchema.parse({
    classSectionId: formData.get('classSectionId'),
    dayOfWeek: Number(formData.get('dayOfWeek')),
    startMinute: timeToMinutes(formData.get('startTime') as string),
    endMinute: timeToMinutes(formData.get('endTime') as string),
  })
  await prisma.classMeeting.create({ data: parsed })
  revalidatePath('/admin/classes')
}

export async function deleteMeeting(formData: FormData) {
  await requireRole('ADMIN')
  const { id } = z.object({ id: z.string().cuid() }).parse({ id: formData.get('id') })
  const meeting = await prisma.classMeeting.delete({ where: { id } })
  revalidatePath(`/admin/classes/${meeting.classSectionId}/edit`)
}
