// Administração de usuários. Só o admin master chega aqui — o backend recusa
// as rotas /api/admin para qualquer outro, e o link nem aparece em Ajustes.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminUser, api } from '../api';
import { useAuth } from '../auth';
import { NumInput } from '../ui';

export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setUsers(await api.get<AdminUser[]>('/api/admin/users'));
      setErro('');
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!user?.is_admin) {
    return (
      <div className="page">
        <p className="muted center">Esta área é do admin master.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header detail-header">
        <button className="back-button" onClick={() => navigate('/config')} aria-label="Voltar para ajustes">
          <span aria-hidden="true">←</span> Ajustes
        </button>
        <div>
          <h2>Usuários</h2>
          <div className="muted small">{users ? `${users.length} cadastrados` : 'carregando…'}</div>
        </div>
      </header>

      {erro && <div className="error">{erro}</div>}

      {users?.map((u) => (
        <UserCard key={u.id} u={u} eu={u.id === user.id} onChanged={carregar} />
      ))}
    </div>
  );
}

function UserCard({ u, eu, onChanged }: { u: AdminUser; eu: boolean; onChanged: () => void }) {
  const [quota, setQuota] = useState(u.invite_quota);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');
  const [senha, setSenha] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  useEffect(() => setQuota(u.invite_quota), [u.invite_quota]);

  async function acao(fn: () => Promise<unknown>, sucesso?: string) {
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      await fn();
      if (sucesso) setMsg(sucesso);
      onChanged();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const salvarQuota = () =>
    acao(() => api.patch(`/api/admin/users/${u.id}`, { invite_quota: quota }), 'Cota salva.');

  const alternarMaster = () =>
    acao(() => api.patch(`/api/admin/users/${u.id}`, { is_admin: u.is_admin ? 0 : 1 }));

  const redefinirSenha = () =>
    acao(async () => {
      await api.post(`/api/admin/users/${u.id}/password`, { password: senha });
      setSenha('');
      setTrocandoSenha(false);
    }, 'Senha redefinida — a pessoa foi desconectada de todos os aparelhos.');

  /**
   * Excluir leva os pontos junto e não tem volta, então exige digitar o nome de
   * usuário — um `confirm` sozinho é fácil demais de aceitar sem ler.
   */
  function excluir() {
    const digitado = prompt(
      `Excluir a conta de ${u.name} apaga também os ${u.punches} pontos registrados. ` +
        `Digite "${u.username}" para confirmar:`
    );
    if (digitado === null) return;
    if (digitado.trim() !== u.username) {
      setErro('Nome de usuário não confere — nada foi excluído.');
      return;
    }
    acao(() => api.del(`/api/admin/users/${u.id}`));
  }

  return (
    <section className="card">
      <div className="card-title-row">
        <h3>
          {u.name} {eu && <span className="muted small">(você)</span>}
        </h3>
        <span className={`badge ${u.is_admin ? 'ok' : ''}`}>{u.is_admin ? 'master' : 'comum'}</span>
      </div>

      <p className="muted small">
        @{u.username} · {u.punches} pontos · desde {u.created_at.slice(0, 10).split('-').reverse().join('/')}
        {u.invited_by && ` · convidado por ${u.invited_by}`}
      </p>

      <div className="inline-field">
        <NumInput value={quota} min={0} max={1000} onChange={setQuota} />
        <span>convites ({u.invites_used} em uso)</span>
        {quota !== u.invite_quota && (
          <button className="link-btn" onClick={salvarQuota} disabled={busy}>
            salvar
          </button>
        )}
      </div>

      {trocandoSenha ? (
        <div className="inline-field">
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="nova senha (mín. 6)"
            autoComplete="new-password"
          />
          <button className="link-btn" onClick={redefinirSenha} disabled={busy || senha.length < 6}>
            definir
          </button>
          <button className="link-btn" onClick={() => setTrocandoSenha(false)} disabled={busy}>
            cancelar
          </button>
        </div>
      ) : !eu ? (
        <div className="user-actions">
          <button className="link-btn" onClick={() => setTrocandoSenha(true)}>
            Redefinir senha
          </button>
          <button className="link-btn" onClick={alternarMaster} disabled={busy}>
            {u.is_admin ? 'Tornar comum' : 'Tornar master'}
          </button>
          <button className="link-btn danger" onClick={excluir} disabled={busy}>
            Excluir conta
          </button>
        </div>
      ) : null}

      {erro && <div className="error">{erro}</div>}
      {msg && <div className="success">{msg}</div>}
    </section>
  );
}
