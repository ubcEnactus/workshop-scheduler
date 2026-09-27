export function workshopRecordReference(id: string) {
  return id.slice(-8).toUpperCase()
}

export function workshopIdentityKey(workshop: {
  title: string
  deliveryStartsOn: Date | null
  deliveryEndsOn: Date | null
}) {
  const start = workshop.deliveryStartsOn?.toISOString().slice(0, 10) ?? ''
  const end = workshop.deliveryEndsOn?.toISOString().slice(0, 10) ?? ''
  return `${workshop.title.trim().toLocaleLowerCase()}\u0000${start}\u0000${end}`
}
