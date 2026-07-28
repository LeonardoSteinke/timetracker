import { useInstall } from '../../install';
import { SettingsHeader } from './shared';

/** Diz de onde o app está sendo aberto e, no celular, oferece instalar. */
export default function SettingsAplicativo() {
  const { standalone, ios, mobile, canPrompt, install } = useInstall();

  return (
    <div className="page">
      <SettingsHeader title="Aplicativo" />

      <section className="card">
        <div className="card-title-row">
          <h3>Instalação</h3>
          <span className={`badge ${standalone ? 'ok' : ''}`}>{standalone ? 'instalado' : 'no navegador'}</span>
        </div>
        {standalone ? (
          <p className="muted small">
            Aberto pelo ícone, em tela cheia. As atualizações chegam sozinhas ao abrir o app.
          </p>
        ) : !mobile ? (
          <p className="muted small">
            Aberto numa aba do navegador. A instalação como app é coisa de celular — abra este endereço
            no telefone para adicionar o ícone à tela de início.
          </p>
        ) : (
          <>
            <p className="muted small">
              Instalando, o TimeTracker abre direto do ícone, em tela cheia e sem a barra do navegador.
            </p>
            {canPrompt ? (
              <button className="btn-secondary" onClick={() => install()}>
                📲 Instalar app
              </button>
            ) : (
              <p className="muted small">
                {ios
                  ? 'No iPhone: toque em Compartilhar no Safari e escolha "Adicionar à Tela de Início".'
                  : 'Use o menu do navegador e procure por "Instalar aplicativo" / "Adicionar à tela inicial".'}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
