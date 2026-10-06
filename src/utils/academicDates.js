export function todayEcuadorIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = type => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function courseHasNotEnded(endDate, now = new Date()) {
  const end = String(endDate || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(end) && end > todayEcuadorIso(now)
}
