# Analise de `src/memoryVector.ts`

> Atualizado em: 26/06/2026 — Memoria vetorial episodica.

## Visao geral

`src/memoryVector.ts` implementa uma memoria vetorial simples baseada em `@xenova/transformers` para lembrar e recuperar trechos relevantes de conversas anteriores.

## Como funciona

- Gera embeddings com `Xenova/all-MiniLM-L6-v2`
- Persiste entradas em `.agent_memory.json`
- Calcula similaridade cosseno entre consulta e registros
- Retorna os top-K itens acima de um threshold

## Funcoes principais

- `remember(content)` — grava um novo item de memoria
- `recall(query, topK, threshold)` — busca memorias relevantes

## Pontos fortes

- Leve e local, sem dependencia de backend externo
- Bom para capturar contexto repetido ou conclusoes antigas
- Integra bem com o explorer node

## Riscos

- Cresce indefinidamente sem politica de limpeza
- Qualidade da recuperacao depende muito do embedding e do threshold
- Arquivo JSON pode ficar grande com o tempo

## Resumo

`src/memoryVector.ts` fornece a camada de memoria semantica rapida do agente local.
