# Análise de `src/promptBuilder.ts`

## Visão geral
`src/promptBuilder.ts` constrói o **system prompt** do Turbo-Agent. Ele injetá contexto dinâmico, herda regras de persona e organiza diretrizes cruciais para o comportamento do LLM.

## Bloco 1 — Sistema de prompts
- Define `SYSTEM_PROMPT` com marcadores: 5→{DYNAMIC_CONTEXT}
- Usa `replace()` para injetar ferramentas, contexto e memória.
- Estrutura autoritativa para controle do fluxo do agente.

**Responsabilidade:** fornecer uma estrutura base de raciocínio ao LLM.

## Bloco 2 — Função buildSystemPrompt
- Recebe `persona` e `memoryContext` como argumentos.
- Inclui regras específicas por persona:
  - `reviewer`: auditoria de segurança
  - `qa`: teste automatizado
  - `researcher`: coleta de informaçõs
  - `browser`: automação web
- Todo prompt termina com instruções para chamadas de tools.

**Responsabilidade:** personalizar o papel do agente com base em necessidade.

## Onde a complexidade está concentrationada
- A implementação é parmaçida, mas codifica regras chaves:
  - `request_user_approval` para grandes mudanças
  - `start_background_command` para operao êsincronas
  - `create_artifact` para saítados extensos
- Regras de formatação JSON são rigorosas, com escapa de novalinas.</think>