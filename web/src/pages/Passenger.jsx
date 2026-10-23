import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { CircleMarker, Marker, Polyline, Tooltip, useMap } from 'react-leaflet'
import BaseMap, { FitTo } from '../components/BaseMap.jsx'
import { CrowdBadge, Meter, seatText } from '../components/Crowd.jsx'
import { BackIcon, BusIcon, CloseIcon, SlidersIcon, WarnIcon, busSvgString } from '../components/Icons.jsx'
import { minutesText, post, usePoll } from '../api.js'

const short = name => (name || '').replace(' Bus Stand', '')

// One marker icon per look. Re-using the same object keeps the marker element alive, so it glides smoothly.
const iconCache = new Map()
function busIcon(bus, selected) {
  const key = `${bus.crowd}|${bus.direction}|${bus.live_gps}|${selected ? bus.id : ''}`
  if (!iconCache.has(key)) {
    const label = selected ? `<span class="bus-label">${bus.id.replace('SP ', '')}</span>` : ''
    iconCache.set(key, L.divIcon({
      // buses going opposite ways are drawn on either side of the road line so they do not overlap
      className: 'bus-marker', iconSize: [38, 38], iconAnchor: bus.direction === 1 ? [19, 31] : [19, 7],
      html: `<div class="bus-pin ${bus.crowd} ${selected ? 'sel' : ''}">${busSvgString(18)}${bus.live_gps ? '<span class="live-dot"></span>' : ''}<span class="arrow">${bus.direction === 1 ? '&rarr;' : '&larr;'}</span>${label}</div>`,
    }))
  }
  return iconCache.get(key)
}

// Moves the map to the chosen stop, keeping it clear of the sheet / side panel
function Focus({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    const zoom = Math.max(map.getZoom(), 14)
    const wide = window.innerWidth >= 900
    const shift = wide ? L.point(-210, 0) : L.point(0, window.innerHeight * 0.17)
    const center = map.unproject(map.project([target.lat, target.lng], zoom).add(shift), zoom)
    map.flyTo(center, zoom, { duration: 0.8 })
  }, [map, target])
  return null
}

function TopBar({ state, demo, demoOpen, setDemoOpen }) {
  const modeClass = state?.mode === 'Peak hour' ? 'peak' : state?.mode === 'Busy' ? 'busy' : ''
  return (
    <div className="floating">
      <div className="pill">
        <span className="logo"><BusIcon size={16} /></span>
        YanaBus
      </div>
      <div className="right-stack">
        <div className="pill">
          <span className="num">{state ? state.time : '--:--'}</span>
          {state && <span className={`mode ${modeClass}`}>{state.mode}</span>}
        </div>
        {demo && (
          <button className="icon-btn" aria-label="Demo controls" onClick={() => setDemoOpen(!demoOpen)}>
            {demoOpen ? <CloseIcon /> : <SlidersIcon />}
          </button>
        )}
      </div>
    </div>
  )
}

function DemoPanel({ state, sections }) {
  const [seg, setSeg] = useState(3)
  const hours = [[8, '08:00 Morning peak'], [14, '14:00 Off-peak'], [17.75, '17:45 Evening peak']]
  const clearAll = async () => { for (let i = 0; i < sections.length; i++) await post('/api/demo/incident', { segment: i, on: false }) }
  return (
    <div style={{ position: 'absolute', zIndex: 1100, right: 12, top: 'calc(env(safe-area-inset-top) + 116px)' }}>
      <div className="panel-card">
        <h3>Time of day</h3>
        <div className="seg">
          {hours.map(([h, label]) => (
            <button key={h} className={`chipbtn ${state && Math.abs(state.hour - h) < 0.4 ? 'on' : ''}`}
              onClick={() => post('/api/demo/hour', { hour: h })}>{label}</button>
          ))}
        </div>
        <label className="switch">Let the clock run
          <input type="checkbox" checked={!!state?.clock_running}
            onChange={e => post('/api/demo/clock', { running: e.target.checked })} />
        </label>
        <h3>Traffic jam</h3>
        <select className="field" value={seg} onChange={e => setSeg(+e.target.value)}>
          {sections.map((s, i) => <option key={s} value={i}>{s}</option>)}
        </select>
        <div className="seg" style={{ marginBottom: 0 }}>
          <button className="chipbtn on" onClick={() => post('/api/demo/incident', { segment: seg, on: true })}>Add jam</button>
          <button className="chipbtn" onClick={clearAll}>Clear jams</button>
        </div>
      </div>
    </div>
  )
}

function Home({ state, stops, onPick }) {
  return (
    <>
      <h1>Where are you waiting?</h1>
      <p className="sub">Galle &ndash; Hikkaduwa &middot; tap your stop</p>
      {state && (
        <div className="stats">
          <div className="stat"><b className="num">{Math.round(state.trip_min_now)} min</b><span>full trip now</span></div>
          <div className="stat"><b className="num">{state.buses.length}</b><span>buses live</span></div>
        </div>
      )}
      <ul className="timeline">
        {(stops || []).map((s, i) => (
          <li key={s.id}>
            <button className={`stop-row ${i === 0 || i === stops.length - 1 ? 'end' : ''}`} onClick={() => onPick(s.id)}>
              <span className="stop-dot" />
              <span className="stop-main">
                <b>{s.name}</b>
                <span className="sub">{s.heading ? `Next bus to ${short(s.heading)}` : 'No bus heading here'}</span>
              </span>
              {s.next_eta_min !== null && (
                <span className="stop-eta">
                  <span className="num">{minutesText(s.next_eta_min)}</span>
                  <small><span className={`dot ${s.crowd}`} />{s.crowd_label}</small>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function StopView({ eta, onBack }) {
  const first = eta?.buses?.[0]
  return (
    <>
      <button className="back" onClick={onBack}><BackIcon /> All stops</button>
      <h1>{eta ? eta.stop : 'Loading...'}</h1>
      <p className="sub">Next buses to this stop</p>
      {eta && !eta.buses.length && <div className="empty">No bus is heading to this stop right now.</div>}
      {first && (
        <div className="hero" style={{ marginTop: 14 }}>
          <div className="meta" style={{ marginTop: 0 }}>Arriving soonest</div>
          <div className="row">
            <div className="big num">{minutesText(first.eta_min)}</div>
            <div style={{ textAlign: 'right' }}>
              <b>{first.bus}</b>
              <div className="meta" style={{ marginTop: 0 }}>to {short(first.heading)}</div>
            </div>
          </div>
          <CrowdBadge level={first.crowd} label={first.crowd_label} />
          <Meter count={first.passengers} level={first.crowd} />
          <div className="meta">{seatText(first.passengers)}</div>
        </div>
      )}
      {eta?.buses?.slice(1).map(b => (
        <div className="bus-row" key={b.bus}>
          <span className="bus-ico"><BusIcon /></span>
          <div className="info">
            <b>{b.bus}</b>
            <div className="sub">to {short(b.heading)}</div>
            <div style={{ marginTop: 4 }}><CrowdBadge level={b.crowd} label={b.crowd_label} /></div>
          </div>
          <div className="eta num">{minutesText(b.eta_min)}</div>
        </div>
      ))}
      <p className="footnote">Arrival times are predicted by AI from live bus speeds and past trips.</p>
    </>
  )
}

function BusView({ bus, onBack }) {
  if (!bus) return <button className="back" onClick={onBack}><BackIcon /> All stops</button>
  return (
    <>
      <button className="back" onClick={onBack}><BackIcon /> All stops</button>
      <h1>{bus.id}</h1>
      <p className="sub">Heading to {short(bus.heading)}</p>
      <div className="hero" style={{ marginTop: 14 }}>
        <div className="meta" style={{ marginTop: 0 }}>Next stop</div>
        <div className="row">
          <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{bus.next_stop}</div>
          <div className="big num">{minutesText(bus.eta_next_min)}</div>
        </div>
        <CrowdBadge level={bus.crowd} label={bus.crowd_label} />
        <Meter count={bus.passengers} level={bus.crowd} />
        <div className="meta">{seatText(bus.passengers, bus.seats)}</div>
      </div>
      <div className="kv">
        <div className="stat"><b className="num">{Math.round(bus.speed_kmh)} km/h</b><span>current speed</span></div>
        <div className="stat"><b>{bus.direction === 1 ? 'To Hikkaduwa' : 'To Galle'}</b><span>direction</span></div>
      </div>
      <p className="footnote">
        {bus.live_gps
          ? 'Live: position and speed come from the driver’s phone GPS right now.'
          : 'Simulated bus (in the real system, position and speed come from the driver’s phone GPS).'}
      </p>
    </>
  )
}

export default function Passenger() {
  const demo = new URLSearchParams(window.location.search).has('demo')
  const route = usePoll('/api/route', 0)
  const state = usePoll('/api/state', 1500)
  const stops = usePoll('/api/stops', 2000)
  const [stopId, setStopId] = useState(null)
  const [busId, setBusId] = useState(null)
  const [tall, setTall] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const eta = usePoll(stopId !== null ? `/api/stops/${stopId}/eta` : null, 1500)

  const routeLine = route?.line
  const focus = useMemo(() => {
    if (stopId === null || !route) return null
    const s = route.stops[stopId]
    return { lat: s.lat, lng: s.lng }
  }, [stopId, route])

  const pickStop = id => { setBusId(null); setStopId(id); setTall(false) }
  const pickBus = id => { setStopId(null); setBusId(id); setTall(false) }
  const back = () => { setStopId(null); setBusId(null) }

  const jam = state?.incidents?.length ? `Jam reported near ${state.incidents.map(i => i.name).join(', ')}. ` : ''
  const alertText = jam + (state?.alert || '')
  const selectedBus = state?.buses?.find(b => b.id === busId)

  return (
    <>
      <BaseMap>
        {routeLine && (
          <>
            <FitTo points={routeLine} />
            <Polyline positions={routeLine} pathOptions={{ color: '#ffffff', weight: 10, opacity: 0.95 }} />
            <Polyline positions={routeLine} pathOptions={{ color: '#111418', weight: 5, opacity: 1 }} />
            {route.stops.map(s => (
              <CircleMarker key={s.id} center={[s.lat, s.lng]}
                radius={s.id === stopId ? 10 : 6}
                pathOptions={{ color: s.id === stopId ? '#2563eb' : '#111418', weight: 3, fillColor: s.id === stopId ? '#2563eb' : '#ffffff', fillOpacity: 1 }}
                eventHandlers={{ click: () => pickStop(s.id) }}>
                <Tooltip key={s.id === stopId ? 'on' : 'off'} className="stop-tip" direction="top" offset={[0, -6]} permanent={s.id === stopId}>{s.name}</Tooltip>
              </CircleMarker>
            ))}
          </>
        )}
        {state?.buses.map(b => (
          <Marker key={b.id} position={[b.lat, b.lng]} icon={busIcon(b, b.id === busId)}
            zIndexOffset={b.id === busId ? 1500 : 1000} eventHandlers={{ click: () => pickBus(b.id) }} />
        ))}
        <Focus target={focus} />
      </BaseMap>

      <TopBar state={state} demo={demo} demoOpen={demoOpen} setDemoOpen={setDemoOpen} />
      {demo && demoOpen && route && <DemoPanel state={state} sections={route.sections} />}
      {alertText && <div className="alert"><WarnIcon />{alertText}</div>}

      <section className={`sheet ${tall ? 'tall' : ''}`}>
        <button className="grabber" aria-label={tall ? 'Collapse' : 'Expand'} onClick={() => setTall(!tall)} />
        <div className="sheet-body">
          {stopId !== null ? <StopView eta={eta} onBack={back} />
            : busId !== null ? <BusView bus={selectedBus} onBack={back} />
              : <Home state={state} stops={stops} onPick={pickStop} />}
        </div>
      </section>
    </>
  )
}
