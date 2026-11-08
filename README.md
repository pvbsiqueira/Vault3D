# 🧊 Vault3D - Gerenciador de arquivos 3D (STL e 3MF)

Aplicativo desktop para Windows e macOS que organiza, inspeciona e visualiza arquivos de impressão 3D (**STL**, **3MF** e **SVG**) direto do computador, sem abrir o fatiador.

---

## ✨ Principais funcionalidades

- **100% local**: os arquivos 3D nunca saem do computador. O app lê as pastas que o usuário conecta.
- **3MF com várias mesas**: miniatura de cada mesa, tempo e gramas de filamento, cores, autor, licença e origem (MakerWorld e MakerOnline).
- **Visualizador 3D** (Three.js) com órbita, zoom e várias peças ao mesmo tempo.
- **Abrir no fatiador**: detecta os fatiadores instalados, lembra o último usado em cada arquivo.
- **Organização**: favoritos, renomear, mover entre pastas, duplicados e Lixeira do sistema.
- **Filamentos**: cadastro dos carretéis (marca, material, cor e quanto resta) e aviso no 3MF se você tem o material e a cor.
- **Novidades**: janela com o que mudou em cada versão (textos em `changelog.js`).
- **Em Alta**: modelos mais baixados do MakerWorld e do MakerOnline.
- **Atualização automática** pelo GitHub Releases.

---

## 🚀 Como executar em desenvolvimento

1. `npm install`
2. `npm start` (no Windows, também pode dar um duplo clique em **iniciar-desktop.bat**)
3. Para empacotar no macOS: `npm run dist:mac` (gera DMG e ZIP unsigned para Intel e Apple Silicon)

Mudanças em `main.js` ou `preload.js` pedem fechar e abrir o app de novo. Mudanças só na tela atualizam com `Ctrl+R` no Windows ou `⌘R` no macOS.

### Testes

`npm test` roda os testes automáticos (leitor de STL, favoritos e regras de arquivos do processo principal).

### Bibliotecas (pasta `vendor/`)

Three.js, JSZip e o cliente do Supabase ficam empacotados em `vendor/`, para o app abrir sem depender de CDN e funcionar sem internet (menos o login). Para atualizar uma versão: mude a versão em `devDependencies` no `package.json`, rode `npm install` e depois `npm run vendor`.

---

## 📦 Versões

Uma tag `vX.Y.Z` na `main` dispara o workflow **Build & Release Desktop App**. A release inclui o instalador Windows (`.exe`) e builds macOS (`.dmg` e `.zip`) para Intel e Apple Silicon. No Windows, o app atualiza automaticamente pelo GitHub Releases. Os builds macOS são unsigned e sem notarização; o usuário precisa permitir a abertura em Privacidade e Segurança e instalar novas versões manualmente.

No macOS, depois da primeira tentativa de abrir um build baixado, acesse **Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim**. Baixe builds apenas das releases oficiais do Vault3D.

---

## 🛠️ Tecnologias

- **Electron** (app Desktop para Windows e macOS)
- **Three.js** (renderização 3D)
- **JSZip** (leitura dos pacotes 3MF)
- **Supabase** (login por e-mail)
- **HTML, CSS e JavaScript puro** (sem framework)
