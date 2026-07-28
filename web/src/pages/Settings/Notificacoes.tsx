import { useEffect, useState } from 'react';
import { useInstall } from '../../install';
import { assinar, cancelar, enviarTeste, estado, PushEstado, suportado } from '../../push';
import { NumInput } from '../../ui';
import { CenterSpinner, SaveBar, SettingsHeader, useSettings } from './shared';

/**
 * Avisos no celular. Duas coisas convivem aqui: ligar o push *neste aparelho*
 * (efeito imediato, é uma assinatura do navegador) e escolher *quais* avisos
 * chegar (preferência do usuário, salva junto com o resto da página).
 */
export default function SettingsNotificacoes() {
  const { s, setS, saved, error, save } = useSettings();
  const { standalone, ios } = useInstall();
  const [push, setPush] = useState<PushEstado | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    estado().then(setPush);
  }, []);

  if (!s) return <CenterSpinner />;

  async function alternar() {
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      if (push?.ativo) await cancelar();
      else await assinar();
      setPush(await estado());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testar() {
    setBusy(true);
    setErro('');
    setMsg('');
    try {
      await enviarTeste();
      setMsg('Aviso de teste enviado.');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // No iPhone o push só existe com o app na tela de início — no Safari em aba
  // nem a permissão pode ser pedida, então o caminho é instalar primeiro.
  const precisaInstalar = ios && !standalone;
  const indisponivel = !suportado() || (push && !push.disponivel);

  return (
    <div className="page">
      <SettingsHeader title="Notificações" />

      <section className="card">
        <div className="card-title-row">
          <h3>Neste aparelho</h3>
          <span className={`badge ${push?.ativo ? 'ok' : ''}`}>
            {push?.ativo ? 'ativas' : 'desligadas'}
          </span>
        </div>

        {precisaInstalar ? (
          <p className="muted small">
            Para receber avisos no iPhone, o app precisa estar na tela de início: toque em
            Compartilhar no Safari e escolha "Adicionar à Tela de Início". Depois volte aqui pelo
            ícone.
          </p>
        ) : indisponivel ? (
          <p className="muted small">
            {suportado()
              ? 'O servidor está sem notificações configuradas.'
              : 'Este navegador não suporta notificações — abra o app instalado no celular.'}
          </p>
        ) : (
          <>
            <p className="muted small">
              Avisos no celular mesmo com o app fechado. Ligar vale só para este aparelho.
            </p>
            <button className="btn-secondary" onClick={alternar} disabled={busy || !push}>
              {push?.ativo ? 'Desligar neste aparelho' : '🔔 Ativar neste aparelho'}
            </button>
            {push?.ativo && (
              <button className="link-btn" onClick={testar} disabled={busy}>
                Enviar teste
              </button>
            )}
            {push?.permissao === 'denied' && (
              <p className="muted small">
                A permissão está bloqueada. Libere as notificações do TimeTracker nos ajustes do
                sistema para poder ativar.
              </p>
            )}
          </>
        )}

        {erro && <div className="error">{erro}</div>}
        {msg && <div className="success">{msg}</div>}
      </section>

      <section className="card">
        <h3>O que avisar</h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!s.notify_end_of_day}
            onChange={(e) => setS({ ...s, notify_end_of_day: e.target.checked ? 1 : 0 })}
          />
          <span>Hora de sair — quando a jornada do dia fecha</span>
        </label>
        {!!s.notify_end_of_day && (
          <div className="inline-field">
            <NumInput
              value={s.notify_end_lead_minutes}
              min={0}
              max={120}
              onChange={(n) => setS({ ...s, notify_end_lead_minutes: n })}
            />
            <span>minutos de antecedência (0 = na hora)</span>
          </div>
        )}

        <label className="check-row">
          <input
            type="checkbox"
            checked={!!s.notify_break_done}
            onChange={(e) => setS({ ...s, notify_break_done: e.target.checked ? 1 : 0 })}
          />
          <span>Intervalo mínimo cumprido — quando já dá para voltar</span>
        </label>
      </section>

      <SaveBar error={error} saved={saved} onSave={save} />
    </div>
  );
}
