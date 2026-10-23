# 🧊 Vault3D - Gerenciador de arquivos 3D (STL e 3MF)

Aplicativo para Windows que organiza, inspeciona e visualiza arquivos de impressão 3D (**STL** e **3MF**) direto do computador, sem abrir o fatiador.

---

## ✨ Principais funcionalidades

- **100% local**: os arquivos 3D nunca saem do computador. O app lê as pastas que o usuário conecta.
- **3MF com várias mesas**: miniatura de cada mesa, tempo e gramas de filamento, cores, autor, licença e origem (MakerWorld e MakerOnline).
- **Visualizador 3D** (Three.js) com órbita, zoom e várias peças ao mesmo tempo.
- **Abrir no fatiador**: detecta os fatiadores instalados, lembra o último usado em cada arquivo.
- **Organização**: favoritos, projetos, renomear, mover entre pastas, duplicados e Lixeira do Windows.
- **Em Alta**: modelos mais baixados do MakerWorld e do MakerOnline.
- **Atualização automática** pelo GitHub Releases.

---

## 🚀 Como executar em desenvolvimento

1. `npm install`
2. `npm start` (ou dê um duplo clique em **iniciar-desktop.bat**)

Mudanças em `main.js` ou `preload.js` pedem fechar e abrir o app de novo. Mudanças só na tela atualizam com `Ctrl+R`.

### Testes

`npm test` roda os testes automáticos (leitor de STL, favoritos e regras de arquivos do processo principal).

### Bibliotecas (pasta `vendor/`)

Three.js, JSZip e o cliente do Supabase ficam empacotados em `vendor/`, para o app abrir sem depender de CDN e funcionar sem internet (menos o login). Para atualizar uma versão: mude a versão em `devDependencies` no `package.json`, rode `npm install` e depois `npm run vendor`.

---

## 📦 Versões

Um tag `vX.Y.Z` na `main` dispara o workflow **Build & Release Desktop App**, que gera o instalador `Vault3D-Setup-X.Y.Z.exe` e o `latest.yml` usados pela atualização automática.

---

## 🛠️ Tecnologias

- **Electron** (app Desktop para Windows)
- **Three.js** (renderização 3D)
- **JSZip** (leitura dos pacotes 3MF)
- **Supabase** (login por e-mail)
- **HTML, CSS e JavaScript puro** (sem framework)
