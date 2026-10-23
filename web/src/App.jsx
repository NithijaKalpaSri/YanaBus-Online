import Passenger from './pages/Passenger.jsx'
import Conductor from './pages/Conductor.jsx'
import Dashboard from './pages/Dashboard.jsx'

// Three pages, picked from the address. Plain links reload the page, which is fine here.
export default function App() {
  const path = window.location.pathname.replace(/\/$/, '').replace(/\.html$/, '')
  if (path === '/conductor') return <Conductor />
  if (path === '/dashboard') return <Dashboard />
  return <Passenger />
}
