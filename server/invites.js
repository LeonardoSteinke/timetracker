// Convites: o caminho de entrada de quem não tem o código do .env.
//
// Cada usuário pode trazer até `invite_quota` pessoas. A vaga é ocupada por quem
// já entrou (para sempre) e por convite pendente — revogar ou deixar vencer um
// que ninguém usou devolve a vaga.
//
// Revogar apaga o convite, em vez de marcá-lo: o código deixou de valer e a
// linha não conta mais nada a ninguém. Pelo mesmo motivo o convite é apagado
// junto com a conta que o usou (CASCADE no schema).

import crypto from 'node:crypto';
import db, { INVITE_TTL_DAYS } from './db.js';

/** Condição SQL de "convite ainda vale": não usado e não vencido. */
const PENDENTE = "used_at IS NULL AND expires_at > datetime('now')";

/** Vagas ocupadas: convites aceitos + pendentes. */
export function vagasUsadas(userId) {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ? AND (used_at IS NOT NULL OR ${PENDENTE})`)
    .get(userId);
  return row.n;
}

/** Agora em 'YYYY-MM-DD HH:MM:SS' UTC — o mesmo formato do datetime() do SQLite. */
function agoraSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** Estado de um convite, derivado das datas (não existe coluna de status). */
export function estadoDe(row) {
  if (row.used_at) return 'aceito';
  return row.expires_at > agoraSql() ? 'pendente' : 'expirado';
}

/** Convite válido com esse código, ou null. */
export function convitePorCodigo(code) {
  return db.prepare(`SELECT * FROM invites WHERE code = ? AND ${PENDENTE}`).get(code);
}

/**
 * Gera um convite para o usuário. `null` quando ele já não tem vaga — quem
 * chama decide o que responder.
 */
export function gerarConvite(userId) {
  const quota = db.prepare('SELECT invite_quota FROM users WHERE id = ?').get(userId)?.invite_quota ?? 0;
  if (vagasUsadas(userId) >= quota) return null;

  // 12 caracteres hex: fácil de ditar por telefone, e o rate limit do /register
  // já cobre a tentativa de adivinhar.
  const code = crypto.randomBytes(6).toString('hex');
  const info = db
    .prepare(
      `INSERT INTO invites (code, inviter_id, expires_at)
       VALUES (?, ?, datetime('now', '+${INVITE_TTL_DAYS} days'))`
    )
    .run(code, userId);
  return db.prepare('SELECT * FROM invites WHERE id = ?').get(info.lastInsertRowid);
}

/** Convites do usuário, do mais novo para o mais velho, com estado resolvido. */
export function listarDoUsuario(userId) {
  const rows = db
    .prepare(
      `SELECT i.*, u.name AS invitee_name
         FROM invites i
         LEFT JOIN users u ON u.id = i.invitee_id
        WHERE i.inviter_id = ?
        ORDER BY i.created_at DESC, i.id DESC`
    )
    .all(userId);
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    created_at: r.created_at,
    expires_at: r.expires_at,
    used_at: r.used_at,
    invitee_name: r.invitee_name,
    estado: estadoDe(r),
  }));
}

/**
 * Revoga um convite do próprio usuário, apagando a linha. Aceita também o já
 * vencido — é o "limpar da lista" de quem não quer mais ver aquele código.
 * Convite já usado não some: apagá-lo esconderia de quem veio a conta que
 * entrou por ele.
 */
export function revogar(id, userId) {
  const info = db
    .prepare('DELETE FROM invites WHERE id = ? AND inviter_id = ? AND used_at IS NULL')
    .run(id, userId);
  return info.changes > 0;
}

/**
 * Marca o convite como usado por alguém. Devolve false se outro cadastro
 * chegou primeiro — a condição no WHERE é o que evita dois usuários nascerem
 * do mesmo convite.
 */
export function marcarUsado(inviteId, userId) {
  const info = db
    .prepare(`UPDATE invites SET used_at = datetime('now'), invitee_id = ? WHERE id = ? AND ${PENDENTE}`)
    .run(userId, inviteId);
  return info.changes > 0;
}
