# Analise de `src/logger.ts` e `src/datadog.ts`

> Atualizado em: 26/06/2026 — Logging local e observabilidade.

## Visao geral

Esses dois arquivos cuidam do logging do projeto e da integracao opcional com Datadog.

## `src/logger.ts`

- Define `Logger` com niveis `debug`, `info`, `warn`, `error`
- Respeita `logFormat` (`text` ou `json`)
- Em JSON, escreve payload estruturado no stdout
- Em texto, usa `picocolors` para realce visual
- Envia tudo tambem para o Datadog dispatcher

## `src/datadog.ts`

- Mantem buffer de logs em memoria
- Faz flush automatico quando o buffer chega a 10 eventos
- Envia para `https://http-intake.logs.<site>/api/v2/logs`
- Usa `DD_API_KEY` ou `DATADOG_API_KEY`

## Pontos fortes

- Logging simples e flexivel
- JSON bom para automacao e observabilidade
- Integração com Datadog sem quebrar o fluxo local

## Riscos

- `debug` depende de `debugMode`
- Falhas de rede do Datadog sao ignoradas silenciosamente
- Buffer em memoria pode perder eventos se o processo morrer

## Resumo

`src/logger.ts` e `src/datadog.ts` formam a camada de observabilidade do Turbo-Agent, com bom suporte a uso local e producao.
