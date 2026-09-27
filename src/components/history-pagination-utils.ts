export function historyPageHref(
  path: string,
  query: Record<string, string | undefined>,
  parameter: string,
  page: number
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, value)
  if (page <= 1) params.delete(parameter)
  else params.set(parameter, String(page))
  const encoded = params.toString()
  return encoded ? `${path}?${encoded}` : path
}
