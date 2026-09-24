/**
 * Gerenciador de Autenticação e Interface de Login (Magic Link / Supabase)
 */

import { 
  getSupabase, 
  signInWithMagicLink, 
  signOut, 
  getCurrentSession, 
  onAuthStateChange,
  verifyEmailOtp
} from './supabase-client.js';
import { 
  getSupabaseConfig, 
  saveSupabaseConfig 
} from './supabase-config.js';

let currentUser = null;
let onAuthSuccessCallback = null;
let lastSentEmail = '';

// Referências aos elementos do DOM
let authContainer = null;
let dashboardLayout = null;
let loginForm = null;
let emailInput = null;
let btnSubmit = null;
let alertBanner = null;
let successBanner = null;
let successSentEmail = null;
let btnUseOtherEmail = null;
let btnResendLink = null;
let authOtpInput = null;
let btnVerifyOtp = null;
let authOtpError = null;
let topbarUserWrap = null;
let topbarUserEmail = null;
let btnLogout = null;
let configNoticeWrap = null;
let btnOpenConfigModal = null;
let configModal = null;
let configUrlInput = null;
let configKeyInput = null;
let btnSaveConfig = null;
let btnCloseConfigModal = null;

/**
 * Validação básica de endereço de e-mail
 * @param {string} email 
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Exibe mensagem de erro na tela de login
 * @param {string} message 
 */
function showError(message) {
  if (!alertBanner) return;
  alertBanner.textContent = message;
  alertBanner.style.display = 'block';
  if (successBanner) successBanner.style.display = 'none';
}

/**
 * Limpa mensagens de erro e sucesso
 */
function clearMessages() {
  if (alertBanner) {
    alertBanner.textContent = '';
    alertBanner.style.display = 'none';
  }
  if (successBanner) {
    successBanner.style.display = 'none';
  }
  if (authOtpError) {
    authOtpError.textContent = '';
    authOtpError.style.display = 'none';
  }
}

/**
 * Alterna estado de carregamento no botão de envio
 * @param {boolean} isLoading 
 */
function setLoading(isLoading) {
  if (!btnSubmit) return;
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnSpinner = btnSubmit.querySelector('.btn-spinner');

  if (isLoading) {
    btnSubmit.disabled = true;
    if (btnText) btnText.textContent = 'Enviando Link...';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';
  } else {
    btnSubmit.disabled = false;
    if (btnText) btnText.textContent = 'Entrar com Magic Link';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

/**
 * Atualiza visualização conforme o estado de autenticação
 * @param {any|null} session 
 */
let hasTriggeredAuthSuccess = false;

function updateAuthUI(session) {
  currentUser = session?.user || null;

  if (currentUser) {
    // Usuário Autenticado: Oculta tela de login e exibe Dashboard
    if (authContainer) authContainer.style.display = 'none';
    if (dashboardLayout) dashboardLayout.style.display = 'flex';

    // Atualiza barra superior
    if (topbarUserWrap) topbarUserWrap.style.display = 'inline-flex';
    if (topbarUserEmail) {
      topbarUserEmail.textContent = currentUser.email || 'Usuário';
      topbarUserEmail.title = currentUser.email || '';
    }

    // Disparar o callback de inicialização da biblioteca apenas UMA vez por sessão
    if (!hasTriggeredAuthSuccess && typeof onAuthSuccessCallback === 'function') {
      hasTriggeredAuthSuccess = true;
      onAuthSuccessCallback(currentUser);
    }
  } else {
    hasTriggeredAuthSuccess = false;

    // Notificar app.js para limpar estado da biblioteca em memória ao sair
    window.dispatchEvent(new CustomEvent('app:reset-library'));

    // Usuário Desconectado: Oculta Dashboard e exibe tela de login
    if (dashboardLayout) dashboardLayout.style.display = 'none';
    if (authContainer) authContainer.style.display = 'flex';

    // Fecha qualquer modal aberto
    const viewerModal = document.getElementById('viewerModal');
    if (viewerModal) viewerModal.style.display = 'none';

    const createProjectModal = document.getElementById('createProjectModal');
    if (createProjectModal) createProjectModal.style.display = 'none';

    if (topbarUserWrap) topbarUserWrap.style.display = 'none';
    if (topbarUserEmail) topbarUserEmail.textContent = '';
  }
}

/**
 * Processa a submissão do formulário de login por Magic Link
 * @param {Event} e 
 */
async function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  clearMessages();

  const email = emailInput ? emailInput.value.trim() : '';

  if (!email) {
    showError('Por favor, digite seu endereço de e-mail.');
    if (emailInput) emailInput.focus();
    return;
  }

  if (!isValidEmail(email)) {
    showError('Formato de e-mail inválido. Ex: seu.nome@email.com');
    if (emailInput) emailInput.focus();
    return;
  }

  // Verificar se o Supabase está configurado
  const config = await getSupabaseConfig();
  if (!config.isConfigured) {
    showError('O Supabase ainda não foi configurado. Configure a URL e Anon Key nas configurações.');
    if (configNoticeWrap) configNoticeWrap.style.display = 'block';
    return;
  }

  try {
    setLoading(true);
    lastSentEmail = email;
    const { data, error } = await signInWithMagicLink(email);

    if (error) {
      console.error('Erro retornado pelo signInWithMagicLink:', error);
      showError(error.message || 'Erro ao enviar o link de acesso. Verifique suas credenciais.');
      return;
    }

    // Sucesso: Exibir estado de confirmação para verificar a caixa de entrada
    if (loginForm) loginForm.style.display = 'none';
    if (successBanner) {
      successBanner.style.display = 'block';
      if (successSentEmail) successSentEmail.textContent = email;
      if (authOtpInput) {
        authOtpInput.value = '';
        setTimeout(() => authOtpInput.focus(), 200);
      }
    }

  } catch (err) {
    console.error('Falha ao autenticar:', err);
    showError(err.message || 'Ocorreu um erro ao processar o login. Tente novamente.');
  } finally {
    setLoading(false);
  }
}

/**
 * Valida o código numérico OTP de 6 dígitos inserido pelo usuário
 */
async function handleVerifyOtp() {
  if (!authOtpInput) return;
  const token = authOtpInput.value.trim();

  if (!token) {
    if (authOtpError) {
      authOtpError.textContent = 'Digite o código de 6 dígitos recebido no seu e-mail.';
      authOtpError.style.display = 'block';
    }
    authOtpInput.focus();
    return;
  }

  const emailToVerify = lastSentEmail || (emailInput ? emailInput.value.trim() : '');
  if (!emailToVerify) {
    showError('E-mail não identificado. Por favor, volte e informe seu e-mail.');
    return;
  }

  if (authOtpError) {
    authOtpError.textContent = '';
    authOtpError.style.display = 'none';
  }

  const btnText = btnVerifyOtp?.querySelector('.btn-otp-text');
  const btnSpinner = btnVerifyOtp?.querySelector('.btn-otp-spinner');

  try {
    if (btnVerifyOtp) btnVerifyOtp.disabled = true;
    if (btnText) btnText.textContent = 'Validando...';
    if (btnSpinner) btnSpinner.style.display = 'inline-block';

    const { data, error } = await verifyEmailOtp(emailToVerify, token);

    if (error) {
      if (authOtpError) {
        authOtpError.textContent = error.message || 'Código incorreto ou expirado.';
        authOtpError.style.display = 'block';
      }
      return;
    }

    if (data?.session) {
      updateAuthUI(data.session);
    }
  } catch (err) {
    console.error('Erro na validação do OTP:', err);
    if (authOtpError) {
      authOtpError.textContent = err.message || 'Falha ao validar o código.';
      authOtpError.style.display = 'block';
    }
  } finally {
    if (btnVerifyOtp) btnVerifyOtp.disabled = false;
    if (btnText) btnText.textContent = 'Confirmar';
    if (btnSpinner) btnSpinner.style.display = 'none';
  }
}

/**
 * Trata o clique no botão de Logout
 */
async function handleLogout() {
  const confirmLogout = window.confirm('Deseja realmente sair da sua conta?');
  if (!confirmLogout) return;

  try {
    await signOut();
    currentUser = null;
    updateAuthUI(null);

    // Resetar campos do formulário
    if (loginForm) loginForm.style.display = 'block';
    if (successBanner) successBanner.style.display = 'none';
    if (emailInput) {
      emailInput.value = '';
      emailInput.focus();
    }
  } catch (err) {
    console.error('Erro ao encerrar sessão:', err);
    alert('Erro ao sair: ' + err.message);
  }
}

/**
 * Inicializa os ouvintes e o estado da autenticação
 * @param {(user: any) => void} onAuthenticated 
 */
export async function initAuth(onAuthenticated) {
  onAuthSuccessCallback = onAuthenticated;

  // Obter elementos do DOM
  authContainer = document.getElementById('authContainer');
  dashboardLayout = document.getElementById('dashboardLayout');
  loginForm = document.getElementById('authLoginForm');
  emailInput = document.getElementById('authEmailInput');
  btnSubmit = document.getElementById('btnSendMagicLink');
  alertBanner = document.getElementById('authAlertBanner');
  successBanner = document.getElementById('authSuccessBanner');
  successSentEmail = document.getElementById('authSuccessSentEmail');
  btnUseOtherEmail = document.getElementById('btnUseOtherEmail');
  btnResendLink = document.getElementById('btnResendMagicLink');
  authOtpInput = document.getElementById('authOtpInput');
  btnVerifyOtp = document.getElementById('btnVerifyOtp');
  authOtpError = document.getElementById('authOtpError');
  topbarUserWrap = document.getElementById('topbarUserWrap');
  topbarUserEmail = document.getElementById('topbarUserEmail');
  btnLogout = document.getElementById('btnLogout');
  configNoticeWrap = document.getElementById('authConfigNotice');
  btnOpenConfigModal = document.getElementById('btnOpenConfigModal');
  configModal = document.getElementById('authConfigModal');
  configUrlInput = document.getElementById('inputSupabaseUrl');
  configKeyInput = document.getElementById('inputSupabaseAnonKey');
  btnSaveConfig = document.getElementById('btnSaveSupabaseConfig');
  btnCloseConfigModal = document.getElementById('btnCloseConfigModal');

  // Eventos do formulário de login
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  if (emailInput) {
    emailInput.addEventListener('input', () => {
      if (alertBanner && alertBanner.style.display !== 'none') {
        clearMessages();
      }
    });
  }

  if (btnUseOtherEmail) {
    btnUseOtherEmail.addEventListener('click', () => {
      if (successBanner) successBanner.style.display = 'none';
      if (loginForm) loginForm.style.display = 'block';
      if (authOtpError) authOtpError.style.display = 'none';
      if (emailInput) {
        emailInput.select();
        emailInput.focus();
      }
    });
  }

  if (btnResendLink) {
    btnResendLink.addEventListener('click', () => {
      handleLoginSubmit();
    });
  }

  // Eventos de verificação do código OTP numérico
  if (btnVerifyOtp) {
    btnVerifyOtp.addEventListener('click', handleVerifyOtp);
  }

  if (authOtpInput) {
    authOtpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleVerifyOtp();
      }
    });
    authOtpInput.addEventListener('input', () => {
      if (authOtpError && authOtpError.style.display !== 'none') {
        authOtpError.style.display = 'none';
      }
    });
  }

  // Botão de Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }

  // Modal e configuração do Supabase
  if (btnOpenConfigModal && configModal) {
    btnOpenConfigModal.addEventListener('click', async () => {
      const config = await getSupabaseConfig();
      if (configUrlInput) configUrlInput.value = config.supabaseUrl || '';
      if (configKeyInput) configKeyInput.value = config.supabaseAnonKey || '';
      configModal.style.display = 'flex';
    });
  }

  if (btnCloseConfigModal && configModal) {
    btnCloseConfigModal.addEventListener('click', () => {
      configModal.style.display = 'none';
    });
  }

  if (btnSaveConfig) {
    btnSaveConfig.addEventListener('click', async () => {
      const url = configUrlInput ? configUrlInput.value.trim() : '';
      const key = configKeyInput ? configKeyInput.value.trim() : '';

      if (!url || !key) {
        alert('Por favor, preencha tanto a URL quanto a Anon Key do Supabase.');
        return;
      }

      saveSupabaseConfig(url, key);
      await getSupabase(true); // reinicializa cliente

      if (configModal) configModal.style.display = 'none';
      if (configNoticeWrap) configNoticeWrap.style.display = 'none';
      clearMessages();
      alert('Configurações salvas com sucesso!');
    });
  }

  // Verificar se credenciais do Supabase estão configuradas
  const config = await getSupabaseConfig();
  if (configNoticeWrap) {
    configNoticeWrap.style.display = config.isConfigured ? 'none' : 'block';
  }

  // Verificar sessão inicial
  try {
    const { data } = await getCurrentSession();
    updateAuthUI(data?.session || null);
  } catch (err) {
    console.warn('Erro ao verificar sessão ativa inicial:', err);
    updateAuthUI(null);
  }

  // Escutar eventos de alteração de autenticação (ex: login em outra aba ou via callback)
  await onAuthStateChange((event, session) => {
    updateAuthUI(session);
  });
}

/**
 * Retorna o usuário autenticado atualmente ou null
 */
export function getAuthenticatedUser() {
  if (window.mockAuthUser) return window.mockAuthUser;
  return currentUser;
}
window.getAuthenticatedUser = getAuthenticatedUser;
