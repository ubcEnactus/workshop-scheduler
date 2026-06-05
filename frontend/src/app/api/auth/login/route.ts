import { cookies } from 'next/headers'

const ADMIN_PASSWORD = 'admin'

export async function POST(request: Request) {
  const { password } = await request.json()
  if (password !== ADMIN_PASSWORD) {
    return Response.json({ error: 'Invalid password' }, { status: 401 })
  }
  const cookieStore = await cookies()
  cookieStore.set('role', 'ADMIN', { path: '/', httpOnly: true, sameSite: 'lax' })
  return Response.json({ ok: true })
}
