export default function CheckEmailPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          We&apos;ve sent you a magic sign-in link. Open the email and click the link to continue.
        </p>
        <p className="mt-6 text-xs text-zinc-500">
          In local dev with no Resend key set, the link is printed to the server console.
        </p>
      </div>
    </main>
  )
}
