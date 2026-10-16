/**
 * Estatísticas de uso do Vault3D (somente abertura e fechamento do app).
 *
 * Cada vez que o app é aberto com um usuário logado, gera uma sessão com
 * id, hora de abertura, hora de fechamento e versão do app. Nada sobre
 * arquivos, pastas ou modelos é enviado.
 *
 * O fechamento nem sempre chega ao servidor (Windows desligando, app
 * travado). Por isso a sessão fica guardada no computador, com a última
 * hora em que o app estava aberto, e é reenviada na próxima abertura.
 */

import { getSupabase } from './supabase-client.js';
import { getSupabaseConfig } from './supabase-config.js';

const STORAGE_KEY = 'vault3d_usage_sessions';
const LOCAL_HEARTBEAT_MS = 60 * 1000; // só grava no próprio PC, não envia nada
const MAX_PENDING_AGE_MS = 14 * 24 * 60 * 60 * 1000;

let current = null;
let accessToken = null;
let supabaseConfig = null;
let heartbeatTimer = null;
let started = false;

function loadPending() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePending(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // localStorage indisponível: segue sem guardar
  }
}

function upsertPending(record) {
  const list = loadPending().filter(item => item.id !== record.id);
  list.push(record);
  savePending(list);
}

function removePending(id) {
  savePending(loadPending().filter(item => item.id !== id));
}

function newSessionId() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function rpcParams(record, ended) {
  return {
    p_id: record.id,
    p_started_at: record.startedAt,
    p_ended_at: ended ? (record.endedAt || record.lastSeenAt) : null,
    p_app_version: record.version || null
  };
}

async function sendSession(record, ended) {
  const supabase = await getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.rpc('log_app_session', rpcParams(record, ended));
  if (error) {
    console.warn('Estatísticas de uso: falha ao enviar sessão.', error.message);
    return false;
  }
  return true;
}

/** Reenvia sessões anteriores do mesmo usuário que não chegaram ao servidor. */
async function flushPreviousSessions(userId) {
  const now = Date.now();
  for (const record of loadPending()) {
    if (current && record.id === current.id) continue;
    const age = now - new Date(record.lastSeenAt || record.startedAt).getTime();
    if (!(age < MAX_PENDING_AGE_MS)) {
      removePending(record.id);
      continue;
    }
    if (record.userId !== userId) continue; // pertence a outra conta; envia quando ela logar
    if (await sendSession(record, true)) removePending(record.id);
  }
}

function touch() {
  if (!current) return;
  current.lastSeenAt = new Date().toISOString();
  upsertPending(current);
}

/** Envio no fechamento: fetch com keepalive para sobreviver ao fechamento da janela. */
function sendOnClose() {
  if (!current) return;
  current.endedAt = new Date().toISOString();
  current.lastSeenAt = current.endedAt;
  upsertPending(current);

  if (!accessToken || !supabaseConfig?.isConfigured) return;
  try {
    fetch(`${supabaseConfig.supabaseUrl}/rest/v1/rpc/log_app_session`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseConfig.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(rpcParams(current, true))
    }).catch(() => {});
  } catch {
    // reenviado na próxima abertura
  }
}

function endCurrent() {
  if (!current) return;
  touch();
  current.endedAt = current.lastSeenAt;
  upsertPending(current);
  current = null;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/**
 * Inicia o registro da sessão quando o usuário já está logado.
 * Só roda no app desktop (Electron).
 * @param {{id: string}} user
 */
export async function startUsageTracking(user) {
  if (!window.electronAPI?.isElectron || !user?.id || current) return;

  try {
    const supabase = await getSupabase();
    if (!supabase) return;

    if (!started) {
      started = true;
      supabase.auth.onAuthStateChange((event, session) => {
        accessToken = session?.access_token || null;
        if (event === 'SIGNED_OUT') endCurrent();
      });
      window.addEventListener('beforeunload', sendOnClose);
      window.addEventListener('app:reset-library', endCurrent);
    }

    supabaseConfig = await getSupabaseConfig();
    const { data } = await supabase.auth.getSession();
    accessToken = data?.session?.access_token || null;

    let version = null;
    try { version = await window.electronAPI.getAppVersion(); } catch { /* sem versão */ }

    const nowIso = new Date().toISOString();
    current = { id: newSessionId(), userId: user.id, startedAt: nowIso, lastSeenAt: nowIso, endedAt: null, version };
    upsertPending(current);
    heartbeatTimer = setInterval(touch, LOCAL_HEARTBEAT_MS);

    await sendSession(current, false);
    await flushPreviousSessions(user.id);
  } catch (err) {
    console.warn('Estatísticas de uso indisponíveis:', err?.message || err);
  }
}
