# 🧊 Vault3D - Viewer & Gerenciador (STL & 3MF)

Uma plataforma web moderna, rápida e 100% client-side para organizar, inspecionar e visualizar arquivos de impressão 3D (**STL** e **3MF**) diretamente do computador, sem a necessidade de abrir softwares fatiadores pesados.

---

## ✨ Principais Funcionalidades

- **100% Local & Privada (Zero Upload)**:
  - Seus arquivos 3D nunca saem do seu computador.
  - Leitura direta via **File System Access API** nativa do navegador.
- **Suporte Avançado a Arquivos 3MF Multi-mesa**:
  - Detecção automática de múltiplas mesas de impressão (*build plates*).
  - Exibição de miniaturas de cada mesa lado a lado (3 quadrados por linha).
  - Suporte a pacotes monolíticos e multi-arquivo (*Production Extension*).
  - Extração de métricas de fatiamento: tempo estimado de impressão e gramas de filamento.
- **Visualizador 3D Integrado (Three.js & WebGL)**:
  - Botão flutuante **Visualizar 3D** para carregar estritamente as peças da mesa ativa.
  - Rotação 3D com órbita, zoom, enquadramento automático e modo aramado (*wireframe*).
- **Renomeação Direta nos Cards**:
  - Botão de lápis e atalhos rápidos (Enter para salvar, Esc para cancelar).
  - **Extensão protegida**: o usuário só altera o nome base, garantindo a integridade do formato.
  - Gravação física direta no disco rígido/SSD via FileSystemHandle.move().
- **Sistema de Favoritos**:
  - Marque modelos favoritos com a estrela ⭐.
  - Divisão dinâmica da tela em seções: **⭐ Favoritos** e **📁 Todos**.
  - Persistência no navegador via localStorage.
- **Ordenação Alfabética Inteligente**:
  - Organização natural A-Z e numerais no início.
  - Agrupamento automático de modelos com caracteres orientais/asiáticos (Kanjis, ideogramas) no final da lista.

---

## 🚀 Como Executar Localmente

1. Dê um duplo clique no arquivo **iniciar.bat** (ou execute o comando powershell -ExecutionPolicy Bypass -File server.ps1).
2. Acesse **http://127.0.0.1:3000** no seu navegador Google Chrome, Microsoft Edge, Brave ou Opera.
3. Clique em **Selecionar Pasta** e aponte para a pasta com seus arquivos .stl e .3mf.

---

## 🛠️ Tecnologias Utilizadas

- **Three.js** (WebGL / Renderização 3D)
- **JSZip** (Extração e parsing de pacotes 3MF)
- **File System Access API** (Acesso local ao sistema de arquivos do usuário)
- **HTML5, CSS3 Moderno e Vanilla JavaScript** (Sem frameworks pesados ou dependências de build)
