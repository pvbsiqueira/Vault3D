# Vault3D

Aplicativo para quem tem impressora 3D organizar e visualizar seus arquivos de impressão (STL e 3MF) direto do computador, sem abrir o fatiador.

## Language

### Biblioteca

**Biblioteca**:
O conjunto de todos os Modelos encontrados nas Pastas conectadas do usuário.
_Avoid_: Galeria, acervo

**Pasta conectada**:
Uma pasta do computador do usuário que o app lê para montar a Biblioteca. Os arquivos nunca saem do computador.
_Avoid_: Diretório, pasta monitorada

**Modelo**:
Um arquivo STL ou 3MF que aparece como um card na biblioteca do usuário.
_Avoid_: Arquivo, item, peça

**Mesa**:
Uma placa de impressão dentro de um 3MF, com suas próprias miniatura, tempo, gramas de filamento e cores. Um STL não tem mesas.
_Avoid_: Placa, plate

### Filamentos

**Carretel**:
Um rolo físico de filamento que o usuário cadastrou, com marca, material, cor e peso restante.
_Avoid_: Filamento (para o item cadastrado), rolo, spool

**Estoque**:
O conjunto de Carretéis cadastrados pelo usuário neste computador.
_Avoid_: Inventário

**Filamento**:
O material e a cor que uma Mesa pede para ser impressa. O app compara os Filamentos de uma Mesa com o Estoque para dizer se o usuário já tem o que precisa.
_Avoid_: Carretel

### Fora da Biblioteca

**Em Alta**:
O ranking dos modelos mais baixados no MakerWorld e no MakerOnline, mostrado dentro do app.
_Avoid_: Trending, populares

**Indicações**:
Produtos recomendados (filamentos, bicos, acessórios), abertos no navegador a partir do app.
_Avoid_: Produtos recomendados, afiliados
