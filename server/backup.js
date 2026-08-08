import fs from 'node:fs/promises';
import path from 'node:path';
import db from './db.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const BACKUP_KEEP = 3;
const CHECK_EVERY_MS = 60 * 60 * 1000;

let running = false;

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function listBackups(dir = BACKUP_DIR) {
  await fs.mkdir(dir, { recursive: true });
  return (await fs.readdir(dir))
    .filter((name) => /^timetracker-\d{4}-\d{2}-\d{2}\.db$/.test(name))
    .sort()
    .reverse();
}

export async function pruneBackups(dir = BACKUP_DIR, keep = BACKUP_KEEP) {
  const files = await listBackups(dir);
  await Promise.all(files.slice(keep).map((name) => fs.unlink(path.join(dir, name))));
  return files.slice(0, keep);
}

/** Cria no máximo um snapshot consistente por dia e conserva só os 3 últimos. */
export async function runDailyBackup(now = new Date()) {
  if (running) return { created: false, reason: 'running' };
  running = true;
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const name = `timetracker-${dayKey(now)}.db`;
    const destination = path.join(BACKUP_DIR, name);
    try {
      await fs.access(destination);
      await pruneBackups();
      return { created: false, file: destination, reason: 'exists' };
    } catch {
      // ainda não existe backup de hoje
    }

    const temporary = `${destination}.tmp`;
    await fs.rm(temporary, { force: true });
    try {
      await db.backup(temporary);
      await fs.rename(temporary, destination);
    } catch (error) {
      await fs.rm(temporary, { force: true });
      throw error;
    }
    await pruneBackups();
    return { created: true, file: destination };
  } finally {
    running = false;
  }
}

export function startBackupScheduler() {
  const check = () => {
    runDailyBackup()
      .then((result) => {
        if (result.created) console.log(`[backup] criado ${path.basename(result.file)}`);
      })
      .catch((error) => console.error('[backup] falhou:', error));
  };
  check();
  const timer = setInterval(check, CHECK_EVERY_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
