# Analise de `src/graph/`

> Atualizado em: 26/06/2026 — Grafo LangGraph modularizado.

## Visao geral

O diretorio `src/graph/` contem o motor de orquestracao atual do Turbo-Agent. A refatoracao extraindo os nos do grafo ja foi concluida.

## Estrutura

- `builder.ts` — monta o `StateGraph` e define o roteamento entre nos
- `state.ts` — define `AgentState` e `normalizeMessages()`
- `utils.ts` — helpers de saida e self-healing
- `nodes/architectNode.ts` — planejador tecnico
- `nodes/coderNode.ts` — executor principal com ferramentas
- `nodes/explorerNode.ts` — descoberta de contexto + RAG
- `nodes/qaNode.ts` — validacao final com testes
- `nodes/toolNode.ts` — autorizacao, auditoria e execucao segura
- `nodes/buildValidator.ts` — roda `tsc --noEmit` apos escrita

## Fluxo do grafo

1. `START -> explorerNode`
2. `explorerNode` pode encaminhar para `tools` ou `architectNode`
3. `architectNode -> coderNode`
4. `coderNode` pode seguir para `tools`, `qaNode` ou terminar
5. `tools` retorna para o node de origem ou para `qaNode`
6. `qaNode` pode aprovar, pedir retrabalho ou chamar tools

## Pontos fortes

- Separacao clara de responsabilidades por node
- Facilita testes e manutencao
- Permite interrupcao antes do `coderNode` para HITL
- Checkpoint persistente com `SqliteSaver`

## Riscos

- Cada node ainda instancia seu proprio `ChatOpenAI`
- Logs de debug ainda aparecem em alguns nodes
- Roteamento usa heuristicas baseadas em mensagens/tool_calls

## Resumo

`src/graph/` e hoje o centro real da inteligencia do Turbo-Agent: modular, persistente e com estados bem definidos.
