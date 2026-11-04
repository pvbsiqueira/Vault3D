/**
 * Modo de teste do Vault3D (usado só pelo teste de fumaça).
 *
 * Só liga quando o app roda pela pasta do projeto (não empacotado) e a
 * variável de ambiente abaixo vale "1". No app instalado fica sempre
 * desligado, seja qual for o ambiente, para ninguém conseguir pular o login.
 */

const TEST_MODE_ENV = 'VAULT3D_TEST_MODE';

// Argumento repassado à janela; o preload o transforma no sinal somente leitura
const TEST_MODE_ARG = '--vault3d-test-mode';

function isTestModeEnabled({ isPackaged, env } = {}) {
  if (isPackaged !== false) return false;
  return Boolean(env) && env[TEST_MODE_ENV] === '1';
}

module.exports = { TEST_MODE_ENV, TEST_MODE_ARG, isTestModeEnabled };
