import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';

type Item = {
  to: string;
  icon: string;
  title: string;
  desc: string;
};

const ITEMS: Item[] = [
  { to: '/config/jornada', icon: '⏱', title: 'Jornada de trabalho', desc: 'Horas por dia, tolerância e intervalo mínimo' },
  { to: '/config/notificacoes', icon: '🔔', title: 'Notificações', desc: 'Avisos no celular e o que notificar' },
  { to: '/config/preferencias', icon: '🌍', title: 'Preferências', desc: 'Fuso horário e início da semana' },
  { to: '/config/conta', icon: '👤', title: 'Conta', desc: 'Nome, usuário e senha' },
  { to: '/config/convites', icon: '✉️', title: 'Convites', desc: 'Convide outras pessoas para o app' },
  { to: '/config/aplicativo', icon: '📲', title: 'Aplicativo', desc: 'Instalação e de onde o app está aberto' },
];

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="page">
      <header className="page-header">
        <h2>Configurações</h2>
      </header>

      <nav className="card settings-menu">
        {ITEMS.map((it) => (
          <Link key={it.to} to={it.to} className="settings-menu-item">
            <span className="settings-menu-icon">{it.icon}</span>
            <span className="settings-menu-text">
              <span className="settings-menu-title">{it.title}</span>
              <span className="settings-menu-desc">{it.desc}</span>
            </span>
            <span className="settings-menu-chevron">›</span>
          </Link>
        ))}

        {user?.is_admin && (
          <Link to="/usuarios" className="settings-menu-item">
            <span className="settings-menu-icon">👥</span>
            <span className="settings-menu-text">
              <span className="settings-menu-title">Administração</span>
              <span className="settings-menu-desc">Gerenciar usuários, cotas e senhas</span>
            </span>
            <span className="settings-menu-chevron">›</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
