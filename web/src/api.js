import { useEffect, useState } from 'react'

export async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} ${res.status}`)
  return res.json()
}

export async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || `${url} ${res.status}`)
  return data
}

/** Loads `url` now and then again every `ms` milliseconds. Pass url = null to pause. */
export function usePoll(url, ms = 1500) {
  const [data, setData] = useState(null)
  useEffect(() => {
    setData(null)
    if (!url) return undefined
    let alive = true
    const load = () => get(url).then(d => alive && setData(d)).catch(() => {})
    load()
    const timer = ms ? setInterval(load, ms) : null
    return () => {
      alive = false
      if (timer) clearInterval(timer)
    }
  }, [url, ms])
  return data
}

export const minutesText = m => (m < 1 ? 'Now' : `${Math.round(m)} min`)
