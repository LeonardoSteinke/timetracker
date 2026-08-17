export const THEMES = ['original', 'tempo', 'terminal', 'editorial', 'nocturno'] as const;

export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'timetracker.theme';
const ORIGINAL_STYLESHEET_ID = 'timetracker-original-theme';
const MODERN_STYLESHEET_ID = 'timetracker-modern-theme';

export const THEME_META: Record<Theme, { name: string; description: string; color: string; darkColor: string }> = {
  original: {
    name: 'Original',
    description: 'O visual clássico, simples e familiar.',
    color: '#4f46e5',
    darkColor: '#0b1120',
  },
  tempo: {
    name: 'Tempo',
    description: 'Papel, tinta e precisão de instrumento.',
    color: '#17211d',
    darkColor: '#111714',
  },
  terminal: {
    name: 'Terminal',
    description: 'Monocromático, técnico e direto ao ponto.',
    color: '#edf6ef',
    darkColor: '#050b08',
  },
  editorial: {
    name: 'Editorial',
    description: 'Tipografia expressiva e cores de impressão.',
    color: '#f2eadc',
    darkColor: '#181410',
  },
  nocturno: {
    name: 'Nocturno',
    description: 'Profundo, luminoso e confortável à noite.',
    color: '#eeefff',
    darkColor: '#070816',
  },
};

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(saved as Theme) ? (saved as Theme) : 'original';
  } catch {
    return 'original';
  }
}

export async function applyTheme(theme: Theme, persist = true): Promise<void> {
  // O Vite remove o `id` do link ao extrair o CSS no build. Reencontramos a
  // única folha compilada pelo caminho e a marcamos para as próximas trocas.
  const modernStyles = document.querySelector<HTMLLinkElement>(`#${MODERN_STYLESHEET_ID}`)
    ?? Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .find((link) => link.id !== ORIGINAL_STYLESHEET_ID
        && (link.href.includes('/assets/') || link.getAttribute('href') === '/src/styles.css'));
  if (modernStyles) modernStyles.id = MODERN_STYLESHEET_ID;
  const originalStyles = document.querySelector<HTMLLinkElement>(`#${ORIGINAL_STYLESHEET_ID}`);
  const root = document.documentElement;

  // As duas folhas bloqueiam o primeiro render e chegam totalmente parseadas.
  // O React só é montado depois desta função, quando `media` já deixou uma — e
  // somente uma — ativa. Nas trocas seguintes a operação continua síncrona.
  if (originalStyles) originalStyles.media = theme === 'original' ? 'all' : 'not all';
  if (modernStyles) modernStyles.media = theme === 'original' ? 'not all' : 'all';
  root.dataset.theme = theme;
  root.style.colorScheme = '';
  root.style.visibility = '';
  updateThemeColor(theme);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // O tema continua valendo nesta sessão quando o armazenamento está bloqueado.
    }
  }
}

function updateThemeColor(theme: Theme) {
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const meta = THEME_META[theme];
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? meta.darkColor : meta.color);
}

export function initializeTheme() {
  void applyTheme(readTheme(), false);
  window.matchMedia?.('(prefers-color-scheme: dark)')
    .addEventListener?.('change', () => updateThemeColor(readTheme()));
}
