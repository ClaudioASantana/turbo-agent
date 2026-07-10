# Analise de `src/context.ts`

> Atualizado em: 26/06/2026 — Contexto dinamico do ambiente.

## Visao geral

`src/context.ts` monta um contexto dinamico do ambiente de execucao para injetar no system prompt.

## O que inclui

- SO e versao via `os.platform()` / `os.release()`
- diretório atual (`CWD`)
- data local
- branch Git atual e status do repositório
- arvore do projeto com profundidade limitada

## Pontos fortes

- Ajuda o agente a se localizar sem perguntar ao usuario
- Bom para tooling local, diagnósticos e planejamento
- Inclui o estado do Git sem depender de outra tool

## Riscos

- `git status` e a arvore podem custar tempo em repositórios grandes
- Pode expor mais contexto do que o necessário em alguns cenários

## Resumo

`src/context.ts` fornece ao agente a percepção minima do ambiente onde ele está operando.
