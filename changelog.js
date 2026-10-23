/**
 * Novidades de cada versão, mostradas na janela "Novidades" depois de uma atualização.
 * A primeira entrada é sempre a versão deste instalador. De 3 a 5 itens curtos por versão.
 * icon: spool | palette | tag | gift | shield | offline | star | rename | layers | settings
 * action (opcional): 'filaments' ou 'settings' mostra um botão que leva até a tela
 */
export const CHANGELOG = [
  {
    version: '1.5.0',
    date: '2026-10-23',
    title: 'Estoque de filamentos',
    items: [
      { icon: 'spool', title: 'Página Filamentos', text: 'Cadastre seus carretéis com marca, material, cor e quanto resta em cada um.', action: 'filaments' },
      { icon: 'palette', title: 'Tem essa cor?', text: 'Ao abrir um 3MF, cada filamento mostra se você tem o material e a cor: Tem, Sem a cor ou Sem PETG, por exemplo.' },
      { icon: 'tag', title: 'Mais de 100 marcas', text: 'Nacionais e importadas. Se a sua não estiver na lista, é só digitar que ela fica salva.' },
      { icon: 'gift', title: 'Novidades', text: 'Este quadro aparece depois de cada atualização. Para ver de novo, clique no presente ao lado de Cards.' }
    ]
  },
  {
    version: '1.4.1',
    date: '2026-10-23',
    title: 'Mais seguro e mais rápido',
    items: [
      { icon: 'shield', title: 'Mais seguro', text: 'O app só abre arquivos STL e 3MF das pastas que você conectou.' },
      { icon: 'offline', title: 'Funciona sem internet', text: 'Visualizador e miniaturas não dependem mais de internet (só o login precisa).' },
      { icon: 'star', title: 'Favoritos fiéis', text: 'Continuam marcados mesmo depois de renomear ou mover o arquivo.' },
      { icon: 'rename', title: 'Renomear sem conflito', text: 'Agora dá para usar o mesmo nome de um arquivo que está em outra pasta.' }
    ]
  },
  {
    version: '1.4.0',
    date: '2026-10-19',
    title: 'Escolha o fatiador',
    items: [
      { icon: 'layers', title: 'Abrir com outro fatiador', text: 'A setinha ao lado de Abrir no Fatiador mostra os fatiadores instalados no seu PC.' },
      { icon: 'star', title: 'Cada arquivo lembra', text: 'O card mostra o último fatiador usado naquele arquivo.' },
      { icon: 'settings', title: 'Página Configurações', text: 'Escolha o fatiador padrão ou adicione outro.', action: 'settings' }
    ]
  }
];
