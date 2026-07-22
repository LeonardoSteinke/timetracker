// Detecta se o app está rodando instalado (standalone) ou numa aba do
// navegador, e oferece a instalação. No Chrome/Android o próprio navegador
// entrega um evento que abre o diálogo nativo; no iOS não existe API para
// isso — só resta ensinar o caminho do "Adicionar à Tela de Início".

import { useCallback, useEffect, useState } from 'react';

const SNOOZE_KEY = 'tt:install-snooze';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Instalado = aberto pelo ícone, fora da moldura do navegador. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari não implementa display-mode; usa este sinalizador próprio
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Só faz sentido oferecer a instalação no celular/tablet — no desktop o app
 * vive numa aba e o convite só atrapalha. Combina o user agent com o tipo de
 * ponteiro para não errar em iPad (que se anuncia como Mac).
 */
export function isMobile(): boolean {
  if (isIOS() || /Android|Mobile|Tablet|Opera Mini|IEMobile/i.test(navigator.userAgent)) return true;
  return window.matchMedia('(pointer: coarse)').matches && window.matchMedia('(max-width: 900px)').matches;
}

function snoozed(): boolean {
  const at = Number(localStorage.getItem(SNOOZE_KEY) || 0);
  return Date.now() - at < SNOOZE_MS;
}

// O navegador dispara `beforeinstallprompt` uma vez só, geralmente antes de
// qualquer tela montar — por isso o evento fica guardado aqui no módulo, e não
// no estado de um componente.
let deferred: InstallPromptEvent | null = null;
const inscritos = new Set<(e: InstallPromptEvent | null) => void>();

function publica(e: InstallPromptEvent | null) {
  deferred = e;
  inscritos.forEach((fn) => fn(e));
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // seguramos para disparar no clique do usuário
  publica(e as InstallPromptEvent);
});
let instalado = false;
window.addEventListener('appinstalled', () => {
  instalado = true;
  publica(null);
});

export function useInstall() {
  const [standalone] = useState(isStandalone);
  const [evt, setEvt] = useState<InstallPromptEvent | null>(deferred);
  const [hidden, setHidden] = useState(snoozed);

  useEffect(() => {
    const onChange = (e: InstallPromptEvent | null) => {
      setEvt(e);
      if (instalado) setHidden(true);
    };
    inscritos.add(onChange);
    return () => {
      inscritos.delete(onChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!evt) return false;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    publica(null); // o evento só pode ser usado uma vez
    return outcome === 'accepted';
  }, [evt]);

  const snooze = useCallback(() => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setHidden(true);
  }, []);

  return {
    standalone: standalone || instalado,
    ios: isIOS(),
    mobile: isMobile(),
    canPrompt: !!evt,
    install,
    hidden,
    snooze,
  };
}

/** Ícone de compartilhar do iOS, desenhado à mão para renderizar em qualquer fonte. */
function ShareIcon() {
  return (
    <svg className="ios-share" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v8h14v-8" />
    </svg>
  );
}

/** Faixa discreta oferecendo a instalação — some quando o app já está instalado. */
export default function InstallBanner() {
  const { standalone, ios, mobile, canPrompt, install, hidden, snooze } = useInstall();
  const [comoFazer, setComoFazer] = useState(false);

  // Só no celular, e só se houver como instalar: evento do navegador ou o
  // passo a passo do iOS. No desktop o convite não aparece.
  if (!mobile || standalone || hidden || (!canPrompt && !ios)) return null;

  return (
    <>
      <div className="install-banner">
        <span className="install-icon">📲</span>
        <div className="install-text">
          <strong>Instale o TimeTracker</strong>
          <span className="muted small">Abre em tela cheia, direto do ícone, sem a barra do navegador.</span>
        </div>
        <button className="btn-secondary install-cta" onClick={() => (canPrompt ? install() : setComoFazer(true))}>
          {canPrompt ? 'Instalar' : 'Como?'}
        </button>
        <button className="link-btn install-close" onClick={snooze} aria-label="dispensar">
          ✕
        </button>
      </div>

      {comoFazer && (
        <div className="modal-backdrop" onClick={() => setComoFazer(false)}>
          <div className="modal install-help" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Adicionar à Tela de Início</h3>
            <ol>
              <li>
                Toque em <strong>Compartilhar</strong> <ShareIcon /> na barra do Safari.
              </li>
              <li>
                Role e escolha <strong>Adicionar à Tela de Início</strong>.
              </li>
              <li>
                Confirme em <strong>Adicionar</strong> — o ícone aparece junto dos seus apps.
              </li>
            </ol>
            <p className="muted small">Precisa ser pelo Safari; outros navegadores no iOS não instalam.</p>
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setComoFazer(false)}>
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
