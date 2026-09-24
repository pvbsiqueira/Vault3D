/**
 * Gerenciador de Configuração do Supabase
 * Suporta leitura dinâmica do backend (/api/config via .env) e fallback para localStorage.
 */

const STORAGE_KEY_URL = 'sb_config_url';
const STORAGE_KEY_ANON = 'sb_config_anon_key';

// Credenciais padrão de produção (Supabase publishable/anon key)
// Seguras para distribuição no cliente / app desktop com Row Level Security (RLS)
const DEFAULT_SUPABASE_URL = 'https://xkzrvbjndldsukkxvbiw.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_65Eya5zhA-8BA66QEznBiA_CmPP2cPD';

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
 * Tenta endpoint /api/config, depois localStorage, depois variáveis globais (window.__ENV__),
 * e por fim as credenciais padrão de produção embutidas.
 * @param {boolean} forceRefresh - Forçar nova busca no backend
 * @returns {Promise<{supabaseUrl: string, supabaseAnonKey: string, isConfigured: boolean}>}
 */
export async function getSupabaseConfig(forceRefresh = false) {
  if (cachedConfig && !forceRefresh) {
    return cachedConfig;
  }

  let supabaseUrl = '';
  let supabaseAnonKey = '';

  // 1. Tentar ler do endpoint local /api/config (carregado do .env pelo servidor quando na web)
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.NEXT_PUBLIC_SUPABASE_URL) {
        supabaseUrl = normalizeSupabaseUrl(data.NEXT_PUBLIC_SUPABASE_URL);
      }
      const key = data.NEXT_PUBLIC_SUPABASE_ANON_KEY || data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (key) {
        supabaseAnonKey = key.trim();
      }
    }
  } catch {
    // Ignora erro se estiver em ambiente estático ou desktop (file://)
  }

  // 2. Fallback para localStorage caso tenha sido configurado manualmente
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
  if ((!supabaseUrl || !supabaseAnonKey) && typeof window !== 'undefined' && window.__ENV__) {
    if (window.__ENV__.NEXT_PUBLIC_SUPABASE_URL && !supabaseUrl) {
      supabaseUrl = normalizeSupabaseUrl(window.__ENV__.NEXT_PUBLIC_SUPABASE_URL);
    }
    const envKey = window.__ENV__.NEXT_PUBLIC_SUPABASE_ANON_KEY || window.__ENV__.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (envKey && !supabaseAnonKey) {
      supabaseAnonKey = envKey.trim();
    }
  }

  // 4. Fallback padrão definitivo para produção / Desktop App (out-of-the-box para o usuário final)
  if (!supabaseUrl || supabaseUrl === 'https://seu-projeto.supabase.co' || supabaseUrl.includes('placeholder')) {
    supabaseUrl = DEFAULT_SUPABASE_URL;
  }
  if (!supabaseAnonKey || supabaseAnonKey.includes('placeholder')) {
    supabaseAnonKey = DEFAULT_SUPABASE_ANON_KEY;
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
