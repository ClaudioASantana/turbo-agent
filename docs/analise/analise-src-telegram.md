# Analise de `src/telegram.ts`

> Atualizado em: 26/06/2026 — Bot Telegram integrado ao agente.

## Visao geral

`src/telegram.ts` cria um bot do Telegram que conversa com o mesmo `Agent` usado pelo servidor e pela CLI.

## O que faz

- Inicializa `Telegraf` se `TELEGRAM_BOT_TOKEN` existir
- Escuta eventos de pause para HITL com botoes inline
- Aceita mensagens de texto e repassa ao `agent.runStep()`
- Aceita audio, baixa o arquivo e transcreve via Whisper
- Retorna resposta final no chat

## Fluxo de HITL

- `pause` emite mensagem com `Aprovar` / `Abortar`
- Aprovar retoma com `agent.runStep(null)`
- Abortar chama `agent.abortPlan()`

## Pontos fortes

- Canal paralelo util para interacao remota
- Suporta voz + texto
- Reaproveita o mesmo core do agente

## Riscos

- Compartilha estado global `agentEvents`
- Audio/transcricao dependem de rede e API externa
- Pode ficar dificil de testar em isolamento

## Resumo

`src/telegram.ts` estende o Turbo-Agent para um canal chat/voz sem mudar o núcleo do agente.
