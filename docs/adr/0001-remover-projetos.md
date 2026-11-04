# Remover a função de Projetos

A função de Projetos (agrupar vários Modelos em um card, com nome e capa próprios) foi removida por completo, incluindo os dados salvos no `localStorage` (`antigravity_custom_projects`), porque ninguém a usa. Os arquivos no disco nunca foram afetados: um Projeto era só um agrupamento visual, então os Modelos voltam a aparecer soltos na Biblioteca. Chegamos a cogitar renomear para "Unificados", mas descartamos, porque manter uma função sem uso só aumenta o `app.js`.
