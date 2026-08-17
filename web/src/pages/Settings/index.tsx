import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../auth';

type Item = {
  to: string;
  icon: IconName;
  title: string;
  desc: string;
};

type IconName = 'time' | 'bell' | 'globe' | 'user' | 'mail' | 'device' | 'palette' | 'team';

const ITEMS: Item[] = [
  { to: '/config/jornada', icon: 'time', title: 'Jornada de trabalho', desc: 'Horas por dia, tolerância e intervalo mínimo' },
  { to: '/config/notificacoes', icon: 'bell', title: 'Notificações', desc: 'Avisos no celular e o que notificar' },
  { to: '/config/preferencias', icon: 'globe', title: 'Preferências', desc: 'Fuso horário e início da semana' },
  { to: '/config/conta', icon: 'user', title: 'Conta', desc: 'Nome, usuário e senha' },
  { to: '/config/convites', icon: 'mail', title: 'Convites', desc: 'Convide outras pessoas para o app' },
  { to: '/config/aplicativo', icon: 'device', title: 'Aplicativo', desc: 'Instalação e de onde o app está aberto' },
  { to: '/config/temas', icon: 'palette', title: 'Temas', desc: 'Cores e personalidade visual deste aparelho' },
];

function SettingsIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    time: <><circle cx="12" cy="12" r="7.5" /><path d="M12 7.5V12l3 2" /></>,
    bell: <><path d="M6.5 16h11l-1.2-2v-3.5a4.3 4.3 0 0 0-8.6 0V14Z" /><path d="M10 18.5h4" /></>,
    globe: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4c2.2 2.3 3.2 5 3.2 8s-1 5.7-3.2 8c-2.2-2.3-3.2-5-3.2-8S9.8 6.3 12 4Z" /></>,
    user: <><circle cx="12" cy="8.5" r="3" /><path d="M6.5 19c.5-3.4 2.3-5.2 5.5-5.2s5 1.8 5.5 5.2" /></>,
    mail: <><rect x="4" y="6.5" width="16" height="11" rx="1.5" /><path d="m5 8 7 5 7-5" /></>,
    device: <><rect x="7" y="3.5" width="10" height="17" rx="2" /><path d="M10.5 17.5h3" /></>,
    palette: <><path d="M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 1.3-3l-.2-.2a1.7 1.7 0 0 1 1.2-2.9H17a3 3 0 0 0 3-3C20 7.1 16.4 4 12 4Z" /><path d="M7.5 11h.01M9.5 7.5h.01M14 7h.01" /></>,
    team: <><circle cx="9" cy="9" r="2.5" /><circle cx="16.5" cy="10" r="2" /><path d="M4.5 18c.4-3 1.9-4.6 4.5-4.6s4.1 1.6 4.5 4.6M14 14.3c2.7-.7 4.5.5 5.2 3.7" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function Settings() {
  const { user, logout } = useAuth();

  return (
    <div className="page">
      <header className="page-header">
        <h2>Configurações</h2>
      </header>

      <nav className="card settings-menu">
        {ITEMS.map((it) => (
          <Link key={it.to} to={it.to} className="settings-menu-item">
            <span className="settings-menu-icon"><SettingsIcon name={it.icon} /></span>
            <span className="settings-menu-text">
              <span className="settings-menu-title">{it.title}</span>
              <span className="settings-menu-desc">{it.desc}</span>
            </span>
            <span className="settings-menu-chevron">›</span>
          </Link>
        ))}

        {user?.is_admin && (
          <Link to="/usuarios" className="settings-menu-item">
            <span className="settings-menu-icon"><SettingsIcon name="team" /></span>
            <span className="settings-menu-text">
              <span className="settings-menu-title">Administração</span>
              <span className="settings-menu-desc">Gerenciar usuários, cotas e senhas</span>
            </span>
            <span className="settings-menu-chevron">›</span>
          </Link>
        )}
      </nav>

      <section className="account-actions" aria-label="Sessão">
        <div>
          <strong>Sessão neste aparelho</strong>
          <span className="muted small">Encerra o acesso e volta para a tela de entrada.</span>
        </div>
        <button className="logout-button" type="button" onClick={() => logout()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 7l5 5-5 5M19 12H8" />
            <path d="M11 5H5v14h6" />
          </svg>
          Sair da conta
        </button>
      </section>
    </div>
  );
}
