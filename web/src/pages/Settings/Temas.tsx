import { useState } from 'react';
import { applyTheme, readTheme, THEME_META, THEMES, type Theme } from '../../theme';
import { SettingsHeader } from './shared';

export default function SettingsTemas() {
  const [selected, setSelected] = useState<Theme>(() => readTheme());

  async function choose(theme: Theme) {
    await applyTheme(theme);
    setSelected(theme);
  }

  return (
    <div className="page themes-page">
      <SettingsHeader title="Temas" />
      <p className="muted theme-intro">
        Escolha o jeito do TimeTracker neste aparelho. Todos acompanham automaticamente a aparência clara ou escura do sistema.
      </p>

      <div className="theme-grid" role="radiogroup" aria-label="Tema visual">
        {THEMES.map((theme) => {
          const meta = THEME_META[theme];
          const active = selected === theme;
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={active}
              className={`theme-option theme-preview-${theme}${active ? ' is-active' : ''}`}
              onClick={() => void choose(theme)}
            >
              <span className="theme-preview" aria-hidden="true">
                <span className="theme-preview-top"><i /><i /><i /></span>
                <span className="theme-preview-time">08:42</span>
                <span className="theme-preview-line"><i /><i /></span>
              </span>
              <span className="theme-option-copy">
                <strong>{meta.name}</strong>
                <small>{meta.description}</small>
              </span>
              <span className="theme-check" aria-hidden="true">{active ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
