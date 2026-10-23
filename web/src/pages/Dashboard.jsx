import { useMemo, useState } from 'react'
import { Polyline, Tooltip } from 'react-leaflet'
import { Bar, Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import BaseMap, { FitTo } from '../components/BaseMap.jsx'
import { BusIcon } from '../components/Icons.jsx'
import { usePoll } from '../api.js'

Chart.register(...registerables)

const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626']
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const speedColor = v => (v < 12 ? '#dc2626' : v < 20 ? '#ea7a00' : v < 27 ? '#c9b200' : '#16a34a')

function Heatmap() {
  const [hour, setHour] = useState(8)
  const sections = usePoll(`/api/analytics/heatmap?hour=${hour}`, 0)
  const points = useMemo(() => (sections ? sections.flatMap(s => s.path) : null), [sections?.length]) // eslint-disable-line
  return (
    <div className="card">
      <h2>Speed heatmap: Galle &ndash; Hikkaduwa</h2>
      <label htmlFor="hr" className="muted">Hour of day: <b style={{ color: 'var(--ink)' }}>{String(hour).padStart(2, '0')}:00</b></label>
      <input id="hr" type="range" min="5" max="21" value={hour} onChange={e => setHour(+e.target.value)} />
      <div className="heat">
        <BaseMap zoomControl>
          {points && <FitTo points={points} inset={false} />}
          {sections?.map(s => (
            <Polyline key={s.section} positions={s.path} pathOptions={{ color: speedColor(s.speed_kmh), weight: 9, opacity: 0.95 }}>
              <Tooltip sticky>{s.section}: {s.speed_kmh} km/h</Tooltip>
            </Polyline>
          ))}
        </BaseMap>
      </div>
      <div className="legend">
        <span style={{ '--c': '#dc2626' }}>under 12 km/h</span>
        <span style={{ '--c': '#ea7a00' }}>12 to 20</span>
        <span style={{ '--c': '#c9b200' }}>20 to 27</span>
        <span style={{ '--c': '#16a34a' }}>27 km/h or more</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const d = usePoll('/api/analytics/summary', 0)

  const text = css('--muted')
  const grid = css('--line')
  const axis = (title, extra = {}) => ({ title: { display: !!title, text: title, color: text }, ticks: { color: text }, grid: { color: grid }, ...extra })
  const noLegend = { legend: { display: false } }

  if (!d) {
    return <div className="page"><div className="topbar"><div className="pill"><span className="logo"><BusIcon size={16} /></span> YanaBus</div></div><p className="muted">Loading...</p></div>
  }

  const worst = d.routes[0]
  const m = d.model?.trip_mae_min
  const hours = Object.keys(d.hours.series)

  return (
    <div className="page">
      <div className="topbar">
        <div className="pill"><span className="logo"><BusIcon size={16} /></span> YanaBus</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="pill" href="/?demo">Passenger map</a>
          <a className="pill" href="/conductor">Conductor</a>
        </div>
      </div>

      <h1>Transport authority dashboard</h1>
      <p className="note">Based on {d.days} days of trip history (simulated data for this prototype). Weekdays only.</p>

      <div className="tiles">
        <div className="card tile dark">
          <div className="big">{worst.route.replace('Galle - ', 'Galle to ')}</div>
          <div className="lbl">Late on {Math.round(worst.late_trips_pct)}% of trips: the route that is late most often</div>
        </div>
        <div className="card tile">
          <div className="big">{m ? m.ai_model.toFixed(1) : '-'} <small>min</small></div>
          <div className="lbl">AI average error per trip{m ? ` (a normal timetable: ${m.timetable.toFixed(1)} min)` : ''}</div>
        </div>
        <div className="card tile">
          <div className="big">{d.trips.toLocaleString()}</div>
          <div className="lbl">trips analysed</div>
        </div>
        <div className="card tile">
          <div className="big">{d.records.toLocaleString()}</div>
          <div className="lbl">road-section records</div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h2>Routes that are late most often</h2>
          <p className="note">Late = more than {d.late_limit_pct}% slower than normal.</p>
          <div className="chartbox">
            <Bar data={{ labels: d.routes.map(r => r.route), datasets: [{ data: d.routes.map(r => r.late_trips_pct), backgroundColor: '#dc2626', borderRadius: 6 }] }}
              options={{ indexAxis: 'y', maintainAspectRatio: false, plugins: noLegend,
                scales: { x: axis('% of trips that were late', { max: 100 }), y: axis() } }} />
          </div>
        </div>

        <div className="card">
          <h2>Delay by hour of the day</h2>
          <p className="note">How much slower than normal a trip is, by the hour it starts.</p>
          <div className="chartbox">
            <Line data={{ labels: d.hours.labels.map(h => `${String(h).padStart(2, '0')}:00`),
              datasets: hours.map((n, i) => ({ label: n, data: d.hours.series[n], borderColor: PALETTE[i % 5], backgroundColor: PALETTE[i % 5], tension: 0.35, pointRadius: 0, borderWidth: 2.5 })) }}
              options={{ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { color: text, boxWidth: 12 } } },
                scales: { x: axis(), y: axis('% slower than normal') } }} />
          </div>
        </div>

        <div className="card">
          <h2>Five slowest road sections</h2>
          <p className="note">Average extra minutes compared with a free road.</p>
          <div className="chartbox">
            <Bar data={{ labels: d.worst_sections.map(s => `${s.section} (${s.route.replace('Galle - ', '')})`),
              datasets: [{ data: d.worst_sections.map(s => s.avg_delay_min), backgroundColor: '#d97706', borderRadius: 6 }] }}
              options={{ indexAxis: 'y', maintainAspectRatio: false, plugins: noLegend,
                scales: { x: axis('average extra minutes'), y: axis() } }} />
          </div>
        </div>

        {m && (
          <div className="card">
            <h2>How accurate is the AI?</h2>
            <p className="note">Average error of the predicted trip time on days the model never saw. Lower is better.</p>
            <div className="chartbox">
              <Bar data={{ labels: ['AI model (live phones)', 'Historical average', 'Normal timetable'],
                datasets: [{ data: [m.ai_model, m.hist_avg, m.timetable], backgroundColor: ['#16a34a', '#2563eb', '#8b95a3'], borderRadius: 6 }] }}
                options={{ maintainAspectRatio: false, plugins: noLegend,
                  scales: { x: axis(), y: axis('average error (minutes)', { beginAtZero: true }) } }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 14 }}><Heatmap /></div>
    </div>
  )
}
