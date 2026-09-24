/**
 * Cliente Supabase com suporte a ESM e autenticação via Magic Link
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getSupabaseConfig } from './supabase-config.js';

let supabaseInstance = null;

/**
 * Inicializa ou retorna a instância ativa do cliente Supabase.
 * @param {boolean} forceRefresh 
 * @returns {Promise<any|null>} Instância do Supabase ou null se não configurado
 */
export async function getSupabase(forceRefresh = false) {
  if (supabaseInstance && !forceRefresh) {
    return supabaseInstance;
  }

  const config = await getSupabaseConfig(forceRefresh);
  if (!config.isConfigured) {
    supabaseInstance = null;
    return null;
  }

  try {
    supabaseInstance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'implicit'
      }
    });
    return supabaseInstance;
  } catch (err) {
    console.error('Erro ao inicializar Supabase Client:', err);
    supabaseInstance = null;
    return null;
  }
}

/**
 * Envia um Magic Link (OTP) para o e-mail informado.
 * @param {string} email 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function signInWithMagicLink(email) {
  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error('Supabase não configurado. Por favor, defina a URL e a Anon Key nas configurações ou no arquivo .env.');
  }

  const trimmedEmail = email ? email.trim().toLowerCase() : '';
  if (!trimmedEmail) {
    throw new Error('Por favor, informe um endereço de e-mail válido.');
  }

  const options = {};
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    options.emailRedirectTo = `${window.location.origin}/auth/callback`;
  }

  return await supabase.auth.signInWithOtp({
    email: trimmedEmail,
    options
  });
}

/**
 * Realiza o encerramento da sessão atual do usuário.
 * @returns {Promise<{error: any}>}
 */
export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) {
    return { error: null };
  }
  return await supabase.auth.signOut();
}

/**
 * Retorna a sessão ativa atual.
 * @returns {Promise<{data: {session: any}, error: any}>}
 */
export async function getCurrentSession() {
  const supabase = await getSupabase();
  if (!supabase) {
    return { data: { session: null }, error: null };
  }
  return await supabase.auth.getSession();
}

/**
 * Registra um ouvinte para alterações no estado de autenticação.
 * @param {(event: string, session: any) => void} callback 
 * @returns {Promise<{subscription: any}|null>}
 */
export async function onAuthStateChange(callback) {
  const supabase = await getSupabase();
  if (!supabase) {
    return null;
  }
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data;
}

/**
 * Troca o código PKCE retornado na URL pela sessão do usuário.
 * @param {string} code 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function exchangeCodeForSession(code) {
  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error('Supabase não inicializado.');
  }
  return await supabase.auth.exchangeCodeForSession(code);
}

/**
 * Valida o código OTP numérico de 6 dígitos enviado ao e-mail
 * @param {string} email 
 * @param {string} token 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function verifyEmailOtp(email, token) {
  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error('Supabase não inicializado.');
  }

  const cleanEmail = email ? email.trim().toLowerCase() : '';
  const cleanToken = token ? token.trim() : '';

  if (!cleanEmail || !cleanToken) {
    throw new Error('Informe o e-mail e o código numérico de 6 dígitos.');
  }

  return await supabase.auth.verifyOtp({
    email: cleanEmail,
    token: cleanToken,
    type: 'email'
  });
}

/**
 * Valida o token_hash retornado pela URL de redirecionamento
 * @param {string} tokenHash 
 * @param {string} type 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function verifyTokenHash(tokenHash, type = 'email') {
  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error('Supabase não inicializado.');
  }

  return await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: type
  });
}

/**
 * Restaura uma sessão ativa diretamente a partir de tokens de acesso (Deep Link / OAuth)
 * @param {string} accessToken 
 * @param {string} refreshToken 
 * @returns {Promise<{data: any, error: any}>}
 */
export async function setSessionTokens(accessToken, refreshToken) {
  const supabase = await getSupabase();
  if (!supabase) {
    throw new Error('Supabase não inicializado.');
  }

  return await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
}
