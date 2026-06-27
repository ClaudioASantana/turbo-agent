# Analise de `src/parser.ts`

> Atualizado em: 26/06/2026 — Parser de tool calls resiliente.

## Visao geral

`src/parser.ts` tenta extrair chamadas de ferramentas quando o LLM devolve texto misturado com JSON, markdown ou tags de funcao.

## O que faz

- Remove blocos `<think>...</think>`
- Entende o formato `<function=nome> { ... }`
- Detecta JSON puro no formato `{ tool, args }`
- Tenta inferir tool calls em blocos markdown ```json```
- Possui fallback agressivo para encontrar chaves JSON em qualquer lugar do texto

## Pontos fortes

- Muito util com modelos que escapam do formato estrito
- Reduz falhas de parsing em provedores locais
- Ajuda a manter o agente funcionando mesmo com respostas imperfeitas

## Riscos

- Parser permissivo demais pode interpretar errado trechos normais de texto
- Regras de parsing complexas podem ficar dificeis de manter

## Resumo

`src/parser.ts` e a camada de tolerancia a respostas malformadas do LLM.
