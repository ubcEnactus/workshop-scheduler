import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays, CheckCircle2, School, Users } from 'lucide-react'
import { redirect } from 'next/navigation'

import { buttonClasses } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth'

const benefits = [
  {
    icon: CalendarDays,
    title: 'Plan with confidence',
    description: 'Keep every published workshop and schedule change in one clear place.',
  },
  {
    icon: Users,
    title: 'Coordinate your team',
    description: 'Give program assistants and teachers the right view at the right time.',
  },
  {
    icon: School,
    title: 'Support every school',
    description: 'Organize workshop delivery across classrooms throughout the Lower Mainland.',
  },
]

export default async function Home() {
  const user = await getCurrentUser()

  if (user) {
    const roleHome: Record<typeof user.role, string> = {
      ADMIN: '/admin',
      TEACHER: '/teacher',
      PA: '/pa',
    }

    redirect(roleHome[user.role] ?? '/login')
  }

  return (
    <main className="min-h-screen bg-[#f4f6f9] text-[#17213b]">
      <section className="relative isolate min-h-[680px] overflow-hidden bg-[#1e2a4a] text-white">
        <Image
          src="/photos/landing-banner.png"
          alt="Students collaborating during an Ennovate workshop"
          fill
          priority
          className="object-cover object-center opacity-35"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17213b] via-[#1e2a4a]/95 to-[#1e2a4a]/45" />

        <div className="relative mx-auto flex min-h-[680px] max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-12">
          <nav className="flex items-center justify-between" aria-label="Primary navigation">
            <Link href="/" className="flex items-center gap-3 text-white">
              <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400 font-black text-[#1e2a4a]">
                E
              </span>
              <span>
                <span className="block text-sm font-bold tracking-wide">ENNOVATE</span>
                <span className="block text-[10px] font-semibold tracking-[0.18em] text-white/65 uppercase">
                  Workshop Scheduler
                </span>
              </span>
            </Link>
            <Link href="/login" className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
              Sign in
            </Link>
          </nav>

          <div className="my-auto max-w-3xl py-20">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-bold tracking-[0.14em] text-amber-300 uppercase">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Workshops, calmly coordinated
            </p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
              More time for inspiring students. Less time managing schedules.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/75 sm:text-lg">
              A shared home for Ennovate&apos;s workshop team to plan, publish, and follow every
              school visit.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/login" className={buttonClasses({ variant: 'primary' })}>
                Open your dashboard
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <p className="text-sm text-white/65">Invite-only access for the Ennovate team</p>
            </div>
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:px-12"
        aria-labelledby="how-it-helps"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-bold tracking-[0.16em] text-amber-700 uppercase">
            One shared plan
          </p>
          <h2 id="how-it-helps" className="mt-3 text-3xl font-bold tracking-tight text-[#1e2a4a]">
            The schedule everyone can trust
          </h2>
          <p className="mt-3 leading-7 text-slate-600">
            Admins coordinate the plan, while teachers and program assistants see the published
            details that matter to them.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-[#1e2a4a]">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
