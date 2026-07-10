# Analise de `src/customAgents.ts`

> Atualizado em: 26/06/2026 — Agentes customizados persistidos em JSON.

## Visao geral

`src/customAgents.ts` permite cadastrar agentes customizados com prompt e ferramentas permitidas.

## O que faz

- Carrega e salva `.custom_agents.json`
- Registra dinamicamente ferramentas `invoke_<id>` no `ToolRegistry`
- Cria subagentes com a classe `Agent` em modo `isSubagent`
- Injeta o system prompt customizado do agente salvo
- Concede permissao dinamica para a nova tool

## Pontos fortes

- Extensivel sem alterar o core do agente
- Bom para personas especializadas
- Reaproveita o mesmo motor de execucao

## Riscos

- Remocao de tools nao e totalmente automatica sem restart
- O sistema pode crescer sem governanca se muitos custom agents forem criados

## Resumo

`src/customAgents.ts` e a porta de extensao do Turbo-Agent para agentes especializados criados pelo usuario.
