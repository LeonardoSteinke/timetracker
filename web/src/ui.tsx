// Componentes de formulário usados por mais de uma tela.

import { useEffect, useState } from 'react';

/** Campo numérico que aceita ficar vazio — vazio vale zero. */
export function NumInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));

  // acompanha mudanças vindas de fora (carregar/salvar) sem atrapalhar a digitação
  useEffect(() => {
    if ((text === '' ? 0 : Number(text)) !== value) setText(String(value));
  }, [value]);

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          setText('');
          onChange(0);
          return;
        }
        const n = Math.min(max, Math.max(min, Number(raw) || 0));
        setText(String(n));
        onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
