# Analise de `src/coreMemory.ts`

> Atualizado em: 26/06/2026 — Regras permanentes do agente.

## Visao geral

`src/coreMemory.ts` guarda regras persistentes que sao injetadas no system prompt do agente.

## O que faz

- Lê regras de `.agent_core_memory.json`
- Adiciona regras novas com `addRule(rule)`
- Remove todas com `clearRules()`
- Expõe `getRules()` para o prompt builder

## Pontos fortes

- Permite manter memoria normativa entre execucoes
- Bom para regras de arquitetura e padroes obrigatorios
- Facil de editar e auditar localmente

## Riscos

- Pode virar uma fonte de regras desordenada se nao houver governanca
- Regras permanentes em excesso podem poluir o prompt

## Resumo

`src/coreMemory.ts` e a memoria normativa do Turbo-Agent: simples, persistente e muito poderosa.
