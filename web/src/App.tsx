import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Week from './pages/Week';
import History from './pages/History';
import DayEditor from './pages/DayEditor';
import Settings from './pages/Settings';

function BottomNav() {
  const items = [
    { to: '/', label: 'Hoje', icon: '⏱' },
    { to: '/semana', label: 'Semana', icon: '📅' },
    { to: '/historico', label: 'Histórico', icon: '📊' },
    { to: '/config', label: 'Ajustes', icon: '⚙️' },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/'} className="nav-item">
          <span className="nav-icon">{it.icon}</span>
          <span className="nav-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/semana" element={<Week />} />
          <Route path="/historico" element={<History />} />
          <Route path="/dia/:date" element={<DayEditor />} />
          <Route path="/config" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
