'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { communicationSchema } from '@/lib/schemas/communication'
import { needsCommunication } from '@/lib/scheduling/communication'
import { scheduleTransaction } from '@/lib/scheduling/store'

export async function markWorkshopCommunicated(formData: FormData) {
  const actor = await requireRole('ADMIN')
  const parsed = communicationSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success)
    redirect('/admin?error=' + encodeURIComponent(parsed.error.issues[0].message))
  const sessionId = await scheduleTransaction(async (tx) => {
    const event = await tx.workshopEvent.findUnique({ where: { id: parsed.data.eventId } })
    if (!event || !needsCommunication(event)) return null
    if (!event.communicatedAt)
      await tx.workshopEvent.update({
        where: { id: event.id },
        data: {
          communicatedAt: new Date(),
          communicatedById: actor.id,
          communicationNote: `Contacted: ${parsed.data.contacted}${parsed.data.note ? `\n${parsed.data.note}` : ''}`,
        },
      })
    return event.workshopSessionId
  })
  revalidatePath('/admin')
  revalidatePath('/admin/workshops', 'layout')
  redirect(
    sessionId
      ? `/admin/workshops/${sessionId}?communicated=1#history`
      : '/admin?error=Communication+task+unavailable.'
  )
}
