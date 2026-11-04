# Diretrizes do Projeto - Autonomia e Fluxo de Desenvolvimento

## 1. Modo de Trabalho Autônomo
- O assistente possui **autorização total** para avançar autonomamente nas tarefas solicitadas pelo usuário.
- Não interrompa o fluxo com perguntas intermediárias ou pedidos de confirmação de etapas óbvias.
- Execute todo o ciclo: análise -> implementação -> testes automatizados no navegador -> commit no Git -> entrega final consolidada.

## 2. Padrões do Projeto
- Suporte nativo e otimizado para arquivos STL e 3MF (incluindo pacotes com múltiplos objetos/mesas e caracteres CJK/orientais).
- Código modular e resiliente em vanilla JavaScript (ES Modules), Three.js e CSS moderno.
- Manter o repositório Git local sempre atualizado com commits descritivos a cada funcionalidade concluída.


## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (pvbsiqueira/Vault3D) via the gh CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one CONTEXT.md and docs/adr/ at the repo root. See `docs/agents/domain.md`.
