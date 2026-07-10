# Analise de `src/historyManager.ts`

> Atualizado em: 26/06/2026 — Historico JSON com compactacao.

## Visao geral

`src/historyManager.ts` controla o historico legado em JSON e faz compactacao quando o contexto cresce demais.

## O que faz

- Carrega e salva `.agent_history.json`
- Mantem a primeira mensagem como system prompt
- Reduz o numero de mensagens quando ultrapassa `maxMessages`
- Usa `summarizeMessages()` para compactar o historico antigo
- Sanitiza strings com `redactSecretsInText()` antes de persistir

## Comportamentos importantes

- `loadHistory()` restaura o historico se o arquivo existir
- `clearHistory()` reescreve a sessao com o system prompt atual
- `compactMemoryIfNecessary()` guarda o pedido original e um resumo do passado

## Pontos fortes

- Simples e resistente a restart do processo
- Reduz o risco de explodir a janela de contexto
- Evita persistir segredos em texto puro sem redacao

## Riscos

- Continua sendo um formato legado paralelo ao checkpoint do LangGraph
- Compactacao depende da LLM e pode falhar ou resumir mal

## Resumo

`src/historyManager.ts` preserva a memoria local da conversa e ajuda a manter o contexto sob controle.
