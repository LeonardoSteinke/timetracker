import { useEffect, useState } from 'react';
import { api, InvitesResponse } from '../../api';
import { SettingsHeader } from './shared';

const INVITE_ESTADO: Record<string, string> = {
  pendente: 'aguardando',
  expirado: 'expirado — a vaga já voltou',
};

/**
 * Convites do usuário. Cada pessoa pode trazer um número limitado de gente
 * (o admin master ajusta a cota); quem já entrou ocupa a vaga para sempre, e
 * revogar ou deixar vencer um convite não usado devolve a vaga.
 */
export default function SettingsConvites() {
  const [dados, setDados] = useState<InvitesResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState<number | null>(null);

  useEffect(() => {
    api.get<InvitesResponse>('/api/invites').then(setDados).catch((e) => setErro((e as Error).message));
  }, []);

  async function gerar() {
    setBusy(true);
    setErro('');
    try {
      setDados(await api.post<InvitesResponse>('/api/invites'));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revogar(id: number, expirado: boolean) {
    const aviso = expirado
      ? 'Remover este convite da lista?'
      : 'Revogar este convite? Quem receber o link não vai mais conseguir usá-lo.';
    if (!confirm(aviso)) return;
    setBusy(true);
    setErro('');
    try {
      setDados(await api.del<InvitesResponse>(`/api/invites/${id}`));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** O link já vem com o código: quem recebe só preenche nome e senha. */
  function linkDe(code: string) {
    return `${window.location.origin}/?convite=${code}`;
  }

  async function copiar(inv: { id: number; code: string }) {
    try {
      await navigator.clipboard.writeText(linkDe(inv.code));
      setCopiado(inv.id);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      // clipboard bloqueado (contexto inseguro): o código fica visível na tela
      setErro('Não consegui copiar — selecione o código na mão.');
    }
  }

  return (
    <div className="page">
      <SettingsHeader title="Convites" />

      {!dados ? (
        <section className="card">
          {erro ? <div className="error">{erro}</div> : <p className="muted small">Carregando…</p>}
        </section>
      ) : (
        <section className="card">
          <div className="card-title-row">
            <h3>Seus convites</h3>
            <span className={`badge ${dados.restantes > 0 ? 'ok' : ''}`}>
              {dados.usadas} de {dados.quota} usados
            </span>
          </div>
          <p className="muted small">
            Cada convite vale para uma pessoa e expira em {dados.ttlDays} dias. Convite aceito ocupa a
            vaga para sempre; revogar um que ninguém usou devolve a vaga.
          </p>

          <button className="btn-secondary" onClick={gerar} disabled={busy || dados.restantes === 0}>
            {dados.restantes > 0 ? '✉️ Gerar convite' : 'Sem convites disponíveis'}
          </button>

          {erro && <div className="error">{erro}</div>}

          {dados.invites.length > 0 && (
            <ul className="invite-list">
              {dados.invites.map((inv) => (
                <li key={inv.id} className={`invite-row is-${inv.estado}`}>
                  <div className="invite-main">
                    <code className="invite-code">{inv.code}</code>
                    <span className="muted small">
                      {inv.estado === 'aceito' ? `aceito por ${inv.invitee_name}` : INVITE_ESTADO[inv.estado]}
                    </span>
                  </div>
                  {inv.estado !== 'aceito' && (
                    <div className="invite-actions">
                      {inv.estado === 'pendente' && (
                        <button className="link-btn" onClick={() => copiar(inv)}>
                          {copiado === inv.id ? '✓ copiado' : 'copiar link'}
                        </button>
                      )}
                      <button
                        className="link-btn danger"
                        onClick={() => revogar(inv.id, inv.estado === 'expirado')}
                        disabled={busy}
                      >
                        {inv.estado === 'expirado' ? 'remover' : 'revogar'}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
