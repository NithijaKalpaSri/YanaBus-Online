import { useEffect, useState } from 'react'
import { CrowdBadge } from '../components/Crowd.jsx'
import { BusIcon } from '../components/Icons.jsx'
import { minutesText, post, usePoll } from '../api.js'

const LEVELS = [
  ['green', 'Seats available'],
  ['orange', 'Few seats left'],
  ['red', 'Standing only'],
]
const RING = { green: 'var(--green)', orange: 'var(--amber)', red: 'var(--red)' }

function Gauge({ count, seats, level }) {
  const r = 44
  const c = 2 * Math.PI * r
  const used = Math.min(1, count / seats)
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" role="img" aria-label={`${count} of ${seats} seats taken`}>
      <circle cx="55" cy="55" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="11" />
      <circle cx="55" cy="55" r={r} fill="none" stroke={RING[level] || 'var(--muted)'} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={`${c * used} ${c}`} transform="rotate(-90 55 55)" style={{ transition: 'stroke-dasharray .5s' }} />
      <text x="55" y="53" textAnchor="middle" fontSize="24" fontWeight="800" fill="var(--ink)">{count}</text>
      <text x="55" y="71" textAnchor="middle" fontSize="11" fill="var(--muted)">on board</text>
    </svg>
  )
}

export default function Conductor() {
  const route = usePoll('/api/route', 0)
  const state = usePoll('/api/state', 1500)
  const [busId, setBusId] = useState(() => {
    try { return localStorage.getItem('yanabus-bus') } catch { return null }
  })
  const [dest, setDest] = useState(null)
  const [patch, setPatch] = useState(null)      // the bus as returned by our latest tap, until the next refresh
  const [toast, setToast] = useState('')

  useEffect(() => { setPatch(null) }, [state])
  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(''), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const live = state?.buses.find(b => b.id === busId) || state?.buses[0]
  const bus = patch && live && patch.id === live.id ? patch : live

  const choose = id => {
    setBusId(id)
    setDest(null)
    try { localStorage.setItem('yanabus-bus', id) } catch { /* storage not available */ }
  }

  // stops this bus still visits, in the order it reaches them
  const ahead = !bus || !route ? [] : bus.direction === 1
    ? route.stops.filter(s => s.id >= bus.next_stop_id)
    : route.stops.filter(s => s.id <= bus.next_stop_id).reverse()
  const destId = ahead.some(s => s.id === dest) ? dest : ahead[0]?.id
  const destName = route?.stops[destId]?.name

  const run = async (fn, okText) => {
    try {
      setPatch(await fn())
      setToast(okText)
    } catch (e) {
      setToast(e.message)
    }
  }
  const sendTicket = () => run(() => post('/api/conductor/ticket', { bus_id: bus.id, to_stop: destId }), `Ticket issued to ${destName}`)
  const sendCrowd = level => run(() => post('/api/conductor/crowd', { bus_id: bus.id, level }), 'Crowd level sent')

  return (
    <div className="screen">
      <div className="topbar">
        <div className="pill"><span className="logo"><BusIcon size={16} /></span> Conductor</div>
        <div className="pill num">{state?.time || '--:--'}</div>
      </div>

      <div className="content">
        <div className="chips" role="tablist" aria-label="Choose your bus">
          {state?.buses.map(b => (
            <button key={b.id} role="tab" aria-selected={bus?.id === b.id}
              className={`chipbtn ${bus?.id === b.id ? 'on' : ''}`} onClick={() => choose(b.id)}>
              {b.id.replace('SP ', '')}
            </button>
          ))}
        </div>

        {bus && (
          <>
            <div className="card">
              <div className="muted" style={{ fontSize: '.85rem' }}>{bus.id} &middot; to {bus.heading}</div>
              <div className="gauge" style={{ marginTop: 10 }}>
                <Gauge count={bus.passengers} seats={bus.seats} level={bus.crowd} />
                <div>
                  <CrowdBadge level={bus.crowd} label={bus.crowd_label} />
                  <div style={{ marginTop: 10, fontWeight: 700 }}>Next: {bus.next_stop}</div>
                  <div className="muted" style={{ fontSize: '.9rem' }}>in about {minutesText(bus.eta_next_min)}</div>
                </div>
              </div>
              <p className="note" style={{ marginTop: 12 }}><span className="dot green" /> Phone GPS is shared with passengers (simulated here).</p>
            </div>

            <div className="card">
              <h2>Issue a ticket</h2>
              <div className="muted" style={{ fontSize: '.85rem', marginBottom: 8 }}>Passenger gets off at</div>
              <div className="dest-grid">
                {ahead.map(s => (
                  <button key={s.id} className={`dest ${s.id === destId ? 'on' : ''}`} onClick={() => setDest(s.id)}>{s.name}</button>
                ))}
              </div>
              <button className="btn" disabled={destId === undefined} onClick={sendTicket}>
                Issue ticket{destName ? ` to ${destName}` : ''}
              </button>
            </div>

            <div className="card">
              <h2>How full is the bus?</h2>
              <div className="crowd-btns">
                {LEVELS.map(([level, label]) => (
                  <button key={level} className={`crowd-btn ${bus.crowd === level ? 'on' : ''}`} onClick={() => sendCrowd(level)}>
                    <span className={`dot ${level}`} style={{ width: 14, height: 14 }} />
                    {label}
                  </button>
                ))}
              </div>
              <button className="link-btn" onClick={() => sendCrowd('auto')}>Back to automatic (from tickets)</button>
              <p className="note">Your choice stays until the next stop.</p>
            </div>
          </>
        )}
      </div>
      <div className={`toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
    </div>
  )
}
