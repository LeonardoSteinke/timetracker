import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import InstallBanner from './install';
import { sincronizar as sincronizarPush } from './push';
import { enviarFila, getSyncStatus, startSync, subscribeOnline, subscribeSync } from './offline';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Week from './pages/Week';
import History from './pages/History';
import DayEditor from './pages/DayEditor';
import Settings from './pages/Settings';
import SettingsJornada from './pages/Settings/Jornada';
import SettingsNotificacoes from './pages/Settings/Notificacoes';
import SettingsPreferencias from './pages/Settings/Preferencias';
import SettingsConta from './pages/Settings/Conta';
import SettingsConvites from './pages/Settings/Convites';
import SettingsAplicativo from './pages/Settings/Aplicativo';
import SettingsTemas from './pages/Settings/Temas';
import Users from './pages/Users';

function BottomNav() {
  const items = [
    { to: '/', label: 'Hoje', icon: 'clock' },
    { to: '/semana', label: 'Semana', icon: 'calendar' },
    { to: '/historico', label: 'Histórico', icon: 'chart' },
    { to: '/config', label: 'Ajustes', icon: 'settings' },
  ];
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      <div className="nav-brand" aria-hidden="true">
        <span className="nav-brand-mark">
          <i className="nav-brand-hand nav-brand-hand-hour" />
          <i className="nav-brand-hand nav-brand-hand-minute" />
          <i className="nav-brand-center" />
        </span>
        <span>tempo</span>
      </div>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.to === '/'} className="nav-item">
          <NavIcon name={it.icon} />
          <span className="nav-label">{it.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></>,
    chart: <><path d="M5 19V9M12 19V5M19 19v-7" /><path d="M3 19h18" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function ConnectionStatus({ userId }: { userId: number }) {
  const [status, setStatus] = useState(() => getSyncStatus(userId));
  useEffect(() => {
    const refresh = () => setStatus(getSyncStatus(userId));
    const offSync = subscribeSync(refresh);
    const offOnline = subscribeOnline(refresh);
    refresh();
    return () => { offSync(); offOnline(); };
  }, [userId]);

  let text = 'Online';
  let kind = 'online';
  if (!status.online) { text = 'Sem conexão'; kind = 'offline'; }
  else if (status.syncing) { text = 'Sincronizando…'; kind = 'syncing'; }
  else if (status.pending) { text = `${status.pending} pendente${status.pending > 1 ? 's' : ''}`; kind = 'pending'; }
  else if (status.lastSyncedAt) {
    const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(status.lastSyncedAt)) / 60000));
    text = minutes < 1 ? 'Sincronizado agora' : `Sincronizado há ${minutes} min`;
  }

  return (
    <div className={`sync-status is-${kind}`} role="status" aria-live="polite">
      <span className="sync-dot" aria-hidden="true" />
      <span>{status.error && status.online ? status.error : text}</span>
      {status.online && (status.pending > 0 || status.error) && !status.syncing && (
        <button className="sync-retry" onClick={() => enviarFila(userId)}>Tentar novamente</button>
      )}
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // O aparelho já assinado reapresenta sua assinatura ao servidor a cada
  // abertura: o navegador pode ter trocado o endereço dela por conta própria.
  useEffect(() => {
    if (user) sincronizarPush();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return startSync(user.id);
  }, [user]);

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
        <InstallBanner />
        <ConnectionStatus userId={user.id} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/semana" element={<Week />} />
          <Route path="/historico" element={<History />} />
          <Route path="/dia/:date" element={<DayEditor />} />
          <Route path="/config" element={<Settings />} />
          <Route path="/config/jornada" element={<SettingsJornada />} />
          <Route path="/config/notificacoes" element={<SettingsNotificacoes />} />
          <Route path="/config/preferencias" element={<SettingsPreferencias />} />
          <Route path="/config/conta" element={<SettingsConta />} />
          <Route path="/config/convites" element={<SettingsConvites />} />
          <Route path="/config/aplicativo" element={<SettingsAplicativo />} />
          <Route path="/config/temas" element={<SettingsTemas />} />
          {/* Fora da BottomNav: são 4 itens no celular e o acesso é raro —
              o caminho é o item de administração em Ajustes. */}
          <Route path="/usuarios" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}
