import { useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'

const KEY = 'yanabus-server'

// In Expo Go the dev server runs on the laptop, so its address is also the laptop's address.
export function guessServer() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  if (host) return `http://${host}:8000`
  if (typeof window !== 'undefined' && window.location?.hostname) return `http://${window.location.hostname}:8000`
  return 'http://192.168.0.10:8000'
}

/** [url, custom, setCustom]: the server address, found automatically unless the user typed one. */
export function useServer() {
  const [custom, setCustomState] = useState(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => setCustomState(v || null)).catch(() => {}).finally(() => setLoaded(true))
  }, [])
  const setCustom = value => {
    const clean = value ? value.trim().replace(/\/$/, '') : null
    setCustomState(clean)
    if (clean) AsyncStorage.setItem(KEY, clean).catch(() => {})
    else AsyncStorage.removeItem(KEY).catch(() => {})
  }
  return [loaded ? custom || guessServer() : null, custom, setCustom]
}

export async function request(base, path, body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(base + path, body === undefined
      ? { signal: ctrl.signal }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.detail || `Server error ${res.status}`)
    return data
  } finally {
    clearTimeout(timer)
  }
}
export const get = (base, path) => request(base, path)
export const post = (base, path, body) => request(base, path, body)

/** Reads `path` every `ms` milliseconds. `online` is false when the server can't be reached. */
export function usePoll(base, path, ms = 2000) {
  const [data, setData] = useState(null)
  const [online, setOnline] = useState(false)
  useEffect(() => {
    if (!base || !path) { setData(null); return undefined }      // nothing to read yet
    let alive = true
    const load = () => get(base, path)
      .then(d => { if (alive) { setData(d); setOnline(true) } })
      .catch(() => { if (alive) setOnline(false) })
    load()
    const timer = ms ? setInterval(load, ms) : null          // ms = 0 means: read once
    return () => { alive = false; if (timer) clearInterval(timer) }
  }, [base, path, ms])
  return { data, online, setData }
}

/** Re-renders every second (for "sent 3 s ago"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  const ref = useRef()
  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(ref.current)
  }, [ms])
  return now
}

export const minutesText = m => (m < 1 ? 'Now' : `${Math.round(m)} min`)
