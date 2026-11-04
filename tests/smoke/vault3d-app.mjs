// Abre o Vault3D de verdade (Electron, pela pasta do projeto) em modo de teste para os testes de fumaça.
// Cada arquivo *.smoke.mjs abre a sua própria sessão do app, com a sua própria pasta de dados temporária.
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { _electron as electron } from 'playwright-core';

const { TEST_MODE_ENV } = createRequire(import.meta.url)('../../test-mode.js');

// Sem a barra final: no Windows `"C:\pasta\"` escapa a aspa e o Electron não acha o app
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const SAMPLE_FOLDER = fileURLToPath(new URL('./fixtures/pasta-exemplo', import.meta.url));
export const SAMPLE_MODELS = fs.readdirSync(SAMPLE_FOLDER).filter(name => /\.(stl|3mf)$/i.test(name));

export async function launchVault3D() {
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: { ...process.env, [TEST_MODE_ENV]: '1' }
  });

  // Ouvintes ligados antes de qualquer espera, para pegar erros desde a abertura da janela
  const consoleErrors = [];
  const consoleWarnings = [];
  const supabaseRequests = [];
  const watchWindow = page => {
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(err.message));
    page.on('request', req => { if (/supabase\.co/i.test(req.url())) supabaseRequests.push(req.url()); });
  };
  app.windows().forEach(watchWindow);
  app.on('window', watchWindow);

  const userDataDir = await app.evaluate(({ app }) => app.getPath('userData'));

  // Pedidos ao Em Alta passam pelo processo principal: contamos sem buscar nada na internet
  await app.evaluate(({ ipcMain }) => {
    globalThis.__trendingCalls = 0;
    ipcMain.removeHandler('fetch-trending-models');
    ipcMain.handle('fetch-trending-models', () => {
      globalThis.__trendingCalls += 1;
      return { success: false, makerWorld: [], makerOnline: [] };
    });
  });

  const window = await app.firstWindow();

  return {
    app,
    window,
    userDataDir,
    consoleErrors,
    consoleWarnings,
    supabaseRequests,
    trendingCalls: () => app.evaluate(() => globalThis.__trendingCalls),

    /** A Biblioteca está na tela (usuário fictício já logado) */
    async waitForLibrary() {
      await window.locator('#dashboardLayout').waitFor({ state: 'visible' });
    },

    /** Conecta a pasta pelo mesmo botão do usuário; o diálogo nativo responde a pasta pedida */
    async connectFolder(folder) {
      await app.evaluate(({ dialog }, chosen) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
      }, folder);
      await window.locator('#btnEmptySelectFolder').click();
    },

    async close() {
      await app.close();
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}
