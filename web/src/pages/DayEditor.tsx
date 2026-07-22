import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, DayResponse, OverrideKind, Punch, PunchKind } from '../api';
import { fmtMin, fmtSigned, fmtDataLonga, WEEKDAYS_LONG, OVERRIDE_LABEL } from '../util';

// O tipo vem da posição do ponto no dia (entrada, saída, entrada, saída…), não
// de uma escolha — por isso aqui só se edita o horário.
const KIND_LABEL: Record<PunchKind, string> = {
  clock_in: 'Entrada',
  clock_out: 'Saída',
};
const KIND_CLS: Record<PunchKind, string> = {
  clock_in: 'k-in',
  clock_out: 'k-out',
};

const OVERRIDE_KINDS: OverrideKind[] = ['holiday', 'vacation', 'sick', 'dayoff', 'custom'];

/** Edição dos pontos de um dia qualquer — inclusive dias passados. */
export default function DayEditor() {
  const { date = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DayResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<DayResponse>(`/api/reports/day?date=${date}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  /** Envolve uma mutação: trava a UI, propaga erro e recarrega o dia. */
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="center-screen">
        {error ? <div className="error">{error}</div> : <div className="spinner" />}
      </div>
    );
  }

  const { day } = data;
  const ov = day.override;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <button className="link-btn" onClick={() => navigate(-1)}>
            ‹ Voltar
          </button>
          <div className="hello">{fmtDataLonga(day.date)}</div>
          <div className="muted small">
            {WEEKDAYS_LONG[day.weekday]}
            {day.date === data.today && ' · hoje'}
          </div>
        </div>
      </header>

      <section className="week-totals card">
        <div>
          <span className="mini-value">{fmtMin(day.workedMinutes)}</span>
          <span className="mini-label">trabalhado</span>
        </div>
        <div>
          <span className="mini-value">{fmtMin(day.expectedMinutes)}</span>
          <span className="mini-label">previsto</span>
        </div>
        <div>
          <span className={`mini-value ${day.balance >= 0 ? 'pos' : 'neg'}`}>{fmtSigned(day.balance)}</span>
          <span className="mini-label">saldo dia</span>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="card-title-row">
          <h3>Registros</h3>
          {day.open && <span className="badge">em andamento</span>}
        </div>
        <p className="muted small">
          Entrada e saída se alternam pela ordem dos horários — mudar uma hora reordena o dia
          sozinho. O tempo entre uma saída e a entrada seguinte vira intervalo.
        </p>

        {day.punches.length === 0 ? (
          <p className="muted">Nenhum registro neste dia.</p>
        ) : (
          <ul className="punch-list">
            {day.punches.map((p) => (
              <PunchEditRow
                key={p.id}
                p={p}
                date={day.date}
                busy={busy}
                onSave={(patch) => run(() => api.patch(`/api/punches/${p.id}`, patch))}
                onDelete={() => run(() => api.del(`/api/punches/${p.id}`))}
              />
            ))}
          </ul>
        )}

        <AddPunch date={day.date} busy={busy} onAdd={(body) => run(() => api.post('/api/punches', body))} />
      </section>

      <section className="card">
        <div className="card-title-row">
          <h3>Exceção do dia</h3>
          {ov && (
            <button className="link-btn danger" disabled={busy} onClick={() => run(() => api.del(`/api/overrides/${day.date}`))}>
              remover
            </button>
          )}
        </div>
        <p className="muted small">
          Feriado, férias, atestado e folga zeram a jornada prevista — o dia deixa de gerar saldo negativo.
        </p>
        <OverrideForm
          date={day.date}
          current={ov}
          busy={busy}
          onSave={(body) => run(() => api.put(`/api/overrides/${day.date}`, body))}
        />
      </section>
    </div>
  );
}

function PunchEditRow({
  p,
  date,
  busy,
  onSave,
  onDelete,
}: {
  p: Punch;
  date: string;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  // `time` vem do servidor já no fuso do usuário; devolvemos date+time e o
  // servidor faz a conversão para UTC.
  const [time, setTime] = useState(p.time ?? '');

  useEffect(() => {
    setTime(p.time ?? '');
  }, [p.time]);

  const dirty = time !== p.time;

  return (
    <li className="punch-row edit">
      <span className={`dot ${KIND_CLS[p.kind]}`} />
      <span className="punch-label">{KIND_LABEL[p.kind]}</span>
      <input type="time" className="punch-time-input" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy} />
      {dirty ? (
        <button className="link-btn" disabled={busy || !time} onClick={() => onSave({ date, time })}>
          salvar
        </button>
      ) : (
        <button className="link-btn danger" disabled={busy} onClick={() => confirm('Remover este registro?') && onDelete()} aria-label="remover">
          ✕
        </button>
      )}
    </li>
  );
}

function AddPunch({
  date,
  busy,
  onAdd,
}: {
  date: string;
  busy: boolean;
  onAdd: (body: Record<string, unknown>) => void;
}) {
  const [time, setTime] = useState('');

  function submit() {
    if (!time) return;
    onAdd({ date, time });
    setTime('');
  }

  return (
    <div className="add-punch">
      <span className="muted small">Novo ponto</span>
      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={busy} />
      <button className="btn-secondary" disabled={busy || !time} onClick={submit}>
        Adicionar
      </button>
    </div>
  );
}

function OverrideForm({
  date,
  current,
  busy,
  onSave,
}: {
  date: string;
  current: { kind: OverrideKind; expected: number | null; note: string | null } | null;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [kind, setKind] = useState<OverrideKind | ''>(current?.kind ?? '');
  const [hours, setHours] = useState(String(Math.floor((current?.expected ?? 0) / 60)));
  const [mins, setMins] = useState(String((current?.expected ?? 0) % 60));
  const [note, setNote] = useState(current?.note ?? '');

  useEffect(() => {
    setKind(current?.kind ?? '');
    setHours(String(Math.floor((current?.expected ?? 0) / 60)));
    setMins(String((current?.expected ?? 0) % 60));
    setNote(current?.note ?? '');
  }, [date, current?.kind, current?.expected, current?.note]);

  function submit() {
    if (!kind) return;
    onSave({
      kind,
      expected: kind === 'custom' ? Number(hours) * 60 + Number(mins) : null,
      note: note.trim() || null,
    });
  }

  return (
    <div className="form">
      <label>
        Tipo
        <select value={kind} onChange={(e) => setKind(e.target.value as OverrideKind | '')} disabled={busy}>
          <option value="">Dia normal (segue a jornada da semana)</option>
          {OVERRIDE_KINDS.map((k) => (
            <option key={k} value={k}>
              {OVERRIDE_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      {kind === 'custom' && (
        <div className="hm-input">
          <input type="number" min={0} max={23} value={hours} onChange={(e) => setHours(e.target.value)} disabled={busy} />
          <span>h</span>
          <input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} disabled={busy} />
          <span>min previstos</span>
        </div>
      )}

      <label>
        Observação
        <input value={note} maxLength={200} placeholder="ex.: Natal" onChange={(e) => setNote(e.target.value)} disabled={busy} />
      </label>

      <button className="btn-primary" disabled={busy || !kind} onClick={submit}>
        Salvar exceção
      </button>
    </div>
  );
}
