/**
 * Gerenciador de Configuração do Supabase
 * Suporta leitura dinâmica do backend (/api/config via .env) e fallback para localStorage.
 */

const STORAGE_KEY_URL = 'sb_config_url';
const STORAGE_KEY_ANON = 'sb_config_anon_key';

let cachedConfig = null;

/**
 * Normaliza e valida URL do Supabase
 * @param {string} url 
 * @returns {string}
 */
export function normalizeSupabaseUrl(url) {
  if (!url) return '';
  let clean = url.trim();
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  return clean.replace(/\/+$/, '');
}

/**
 * Obtém as configurações do Supabase.
 * Tenta endpoint /api/config, depois localStorage, depois variáveis globais (window.__ENV__).
 * @param {boolean} forceRefresh - Forçar nova busca no backend
 * @returns {Promise<{supabaseUrl: string, supabaseAnonKey: string, isConfigured: boolean}>}
 */
export async function getSupabaseConfig(forceRefresh = false) {
  if (cachedConfig && !forceRefresh) {
    return cachedConfig;
  }

  let supabaseUrl = '';
  let supabaseAnonKey = '';

  // 1. Tentar ler do endpoint local /api/config (carregado do .env pelo servidor)
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.NEXT_PUBLIC_SUPABASE_URL) {
        supabaseUrl = normalizeSupabaseUrl(data.NEXT_PUBLIC_SUPABASE_URL);
      }
      if (data.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        supabaseAnonKey = data.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
      }
    }
  } catch {
    // Ignora erro se estiver em ambiente estático sem servidor powershell
  }

  // 2. Fallback para localStorage caso não venha do servidor
  if (!supabaseUrl || !supabaseAnonKey) {
    try {
      const localUrl = localStorage.getItem(STORAGE_KEY_URL);
      const localKey = localStorage.getItem(STORAGE_KEY_ANON);
      if (localUrl && !supabaseUrl) supabaseUrl = normalizeSupabaseUrl(localUrl);
      if (localKey && !supabaseAnonKey) supabaseAnonKey = localKey.trim();
    } catch {
      // localStorage pode estar bloqueado em certos iframes
    }
  }

  // 3. Fallback para window.__ENV__ se injetado
  if ((!supabaseUrl || !supabaseAnonKey) && window.__ENV__) {
    if (window.__ENV__.NEXT_PUBLIC_SUPABASE_URL && !supabaseUrl) {
      supabaseUrl = normalizeSupabaseUrl(window.__ENV__.NEXT_PUBLIC_SUPABASE_URL);
    }
    if (window.__ENV__.NEXT_PUBLIC_SUPABASE_ANON_KEY && !supabaseAnonKey) {
      supabaseAnonKey = window.__ENV__.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();
    }
  }

  const isConfigured = Boolean(
    supabaseUrl && 
    supabaseAnonKey && 
    supabaseUrl !== 'https://seu-projeto.supabase.co' &&
    !supabaseUrl.includes('placeholder')
  );

  cachedConfig = {
    supabaseUrl,
    supabaseAnonKey,
    isConfigured
  };

  return cachedConfig;
}

/**
 * Salva as credenciais do Supabase no localStorage para uso imediato
 * @param {string} url 
 * @param {string} anonKey 
 */
export function saveSupabaseConfig(url, anonKey) {
  const cleanUrl = normalizeSupabaseUrl(url);
  const cleanKey = (anonKey || '').trim();

  try {
    localStorage.setItem(STORAGE_KEY_URL, cleanUrl);
    localStorage.setItem(STORAGE_KEY_ANON, cleanKey);
  } catch (err) {
    console.error('Falha ao persistir credenciais no localStorage:', err);
  }

  cachedConfig = {
    supabaseUrl: cleanUrl,
    supabaseAnonKey: cleanKey,
    isConfigured: Boolean(cleanUrl && cleanKey)
  };

  return cachedConfig;
}

/**
 * Limpa as credenciais salvas no localStorage
 */
export function clearSupabaseConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_ANON);
  } catch {
    // Ignora
  }
  cachedConfig = null;
}
