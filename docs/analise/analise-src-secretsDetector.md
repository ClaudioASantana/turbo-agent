# Analise de `src/secretsDetector.ts`

> Atualizado em: 26/06/2026 — Detector de segredos com varios padroes.

## Visao geral

`src/secretsDetector.ts` procura credenciais e segredos comuns em textos antes de exibir ou persistir informacoes sensiveis.

## O que detecta

Inclui padroes para:

- AWS Access Key e Secret
- GitHub tokens (`ghp_`, `github_pat_`, `gho_`)
- OpenAI API key
- Anthropic, Google, Stripe, Slack, Discord, SendGrid, Twilio
- JWT
- private key blocks PEM/OpenSSH
- assignments genericos como `password`, `secret`, `token`, `api_key`

## Funcoes principais

- `detectSecrets(content)` — retorna lista de matches com linha e preview
- `hasSecrets(content)` — atalho booleano
- `formatSecretsWarning(matches)` — mensagem amigavel para o usuario
- `redactSecretsInText(content)` — mascara segredos em texto

## Pontos fortes

- Cobertura boa para casos comuns de credenciais reais
- Preview parcialmente mascarado ajuda a orientar o usuario sem vazar o dado
- Integrado com auditoria e `SecurityManager`

## Riscos

- Regex sempre pode falhar em formatos novos ou ofuscados
- Alguns segredos podem escapar se o nome do campo nao bater com os padroes

## Resumo

`src/secretsDetector.ts` e a primeira linha de defesa contra vazamento acidental de credenciais no agente.
