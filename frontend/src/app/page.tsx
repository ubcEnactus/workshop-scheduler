export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-emerald-50 px-6 text-center">
      <div className="rounded-3xl bg-white p-12 shadow-xl">
        <h1 className="text-5xl font-bold text-emerald-700">UBC Enactus</h1>

        <p className="mt-4 text-lg text-gray-600">
          Students creating sustainable impact through innovation and entrepreneurship.
        </p>

        <button className="mt-8 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700">
          Join Us
        </button>
      </div>
    </main>
  )
}
