# Analise de `src/rag.ts`

> Atualizado em: 26/06/2026 — RAG sobre o codebase com Vectra.

## Visao geral

`src/rag.ts` faz indexacao semantica do proprio codigo-fonte usando `vectra` e `@xenova/transformers`.

## O que faz

- Percorre arquivos `.ts`, `.tsx` e `.js` dentro de `src/`
- Divide o texto em chunks com overlap
- Gera embeddings para cada chunk
- Indexa no `LocalIndex` do Vectra em `.agent_vectra_db`
- Permite busca por linguagem natural com `search(query)`

## Pontos fortes

- Muito util para o explorer node encontrar contexto de arquitetura
- Indexacao local, sem dependencias externas
- Busca por semantica real, nao apenas match exato

## Riscos

- Indexacao pode ser custosa na primeira execucao
- Chunking por linhas e simples e pode perder fronteiras semanticas
- O indice pode ficar desatualizado apos mudancas grandes sem rebuild

## Resumo

`src/rag.ts` e a base do RAG do Turbo-Agent sobre o proprio repositorio.
