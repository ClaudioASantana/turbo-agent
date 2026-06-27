# Analise de `src/permissions.ts`

> Atualizado em: 26/06/2026 — Sistema granular de permissao.

## Visao geral

`src/permissions.ts` define o mapa de permissao das ferramentas e implementa o cache de permissoes concedidas pelo usuario.

## O que define

- `PermissionLevel`: `read`, `network`, `write`, `execute`, `dangerous`
- `ToolPermission`: nome, nivel, descricao e se exige aprovacao
- `TOOL_PERMISSIONS`: lista principal de ferramentas e politicas

## Regras de checagem

`checkPermission(toolName)` aplica a sequencia:
1. bloqueio explicito via `blockedTools`
2. whitelist via `allowedTools` (quando preenchida)
3. aprovacao requerida via `requireApprovalFor` ou flag da tool

## Cache de permissoes

- `grantedPermissions` guarda aprovacoes permanentes
- `isPermissionGranted()` verifica por ferramenta, arquivo ou diretorio
- `grantPermission()` grava permissao para uma tool/alvo

## Pontos fortes

- Controle granular por alvo
- Suporta aprovacao permanente por arquivo ou diretorio
- Facilita HITL sem pedir permissao repetidamente

## Riscos

- Cache em memoria pode ficar desalinhado com mudancas do ambiente
- A permissao de host continua sendo poderosa demais para tools de escrita
- Ferramentas com `allowedTools` vazio podem virar permissao ampla demais se a configuracao nao for cuidadosa

## Resumo

`src/permissions.ts` e a base da governanca operacional do agente: simples, util e critica para evitar abusos nas tools.
