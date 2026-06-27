# Resumo do Turbo-Agent

> Atualizado em: 26/06/2026 — Baseado na leitura direta do código-fonte atual.

O **Turbo-Agent** é um agente local/autônomo para desenvolvimento, operado por CLI e servidor web React, e combina:

- **LLM compatível com OpenAI** (local via `LLM_BASE_URL`, OpenAI, OpenRouter)
- **LangGraph** com grafo modular: Explorer → Architect → Coder → QA → Tool
- **Terminal Docker isolado** via `node-pty` para execução segura de comandos
- **Memória em 3 camadas**: histórico JSON + checkpoint SQLite + vetorial (`@xenova/transformers`) + RAG Vectra + CoreMemory permanente
- **Integrações**: MCP, Telegram, Whisper, Datadog, Playwright (browser headless)
- **Governança**: SecurityManager, permissões granulares, 18 padrões de detecção de secrets, auditoria SQLite WAL

## Estrutura real do código (2026)

**Entrypoints:** `src/index.ts` (CLI) · `src/server.ts` (Web)

**Núcleo:** `src/agent.ts` · `src/graph/builder.ts` · `src/graph/nodes/` (5 nós + buildValidator)

**Servidor modularizado:** `src/server/sse.ts` · `src/server/routes/` (chat, audit, tasks, transcribe, agents)

**Ferramentas:** `src/tools.ts` (35+ ferramentas, 1086 linhas) · `src/terminal.ts` (Docker sandbox via node-pty)

**Segurança:** `src/securityManager.ts` · `src/permissions.ts` · `src/secretsDetector.ts` · `src/audit.ts`

**Memória:** `src/historyManager.ts` · `src/memoryVector.ts` · `src/rag.ts` · `src/coreMemory.ts` · `src/context.ts`

**Infra:** `src/llmClient.ts` · `src/logger.ts` · `src/datadog.ts` · `src/parser.ts` · `src/promptBuilder.ts`

## Fluxo de execução (atualizado)

1. Inicializa LLM via `initLLM()`, carrega MCP, cria instância `Agent`
2. `Agent` monta checkpointer SQLite, gera thread ID, compila grafo via `createAgentGraph()`
3. Usuário envia prompt (CLI, HTTP, Telegram ou voz)
4. `runStep()` injeta o prompt no LangGraph e inicia streaming de eventos
5. **explorerNode**: RAG semântico + memória vetorial → encontra contexto e arquivos
6. **architectNode**: monta plano técnico com regras da CoreMemory
7. Grafo **pausa antes do coderNode** (HITL) — usuário aprova ou cancela
8. **coderNode**: executa ferramentas ou delega para sub-agentes em paralelo
9. **toolNode**: SecurityManager → auditoria → execução → `tsc --noEmit`
10. **qaNode**: roda `run_unit_tests`, aprova ou envia para retrabalho
11. Resposta via SSE, stdout ou Telegram. Histórico salvo em JSON e SQLite

## Pontos fortes (estado atual)

- Grafo completamente **modularizado** em `src/graph/nodes/` (refatoração já concluída)
- Servidor **modularizado** em routers independentes (refatoração já concluída)
- Terminal via **Docker sandbox** — execução isolada de `run_command`
- `tsc --noEmit` pós-escrita — self-healing TypeScript embutido
- **18 padrões** de detecção de secrets (AWS, GitHub, OpenAI, JWT, Stripe, Discord, etc.)
- **Cache de permissões** granular (por ferramenta, arquivo ou diretório)
- Sub-agentes especializados por persona + custom agents via UI
- Compactação de memória por LLM quando histórico excede `maxMessages`

## Riscos e dívida técnica atual

- `src/tools.ts` com **1086 linhas** — maior ponto de acoplamento restante
- Cada nó do grafo instancia seu próprio `ChatOpenAI` — configuração duplicada em 4 arquivos
- Logs de debug `console.log` espalhados nos nós (explorerNode, coderNode)
- Ferramentas de arquivo (`read_file`, `write_file`) têm **acesso irrestrito ao host**
- `UI_MODE=true` auto-aprova ferramentas perigosas silenciosamente no modo web
- `maxIterations` padrão é 32, mas `/goal` eleva para 100 sem aviso

## Em uma frase

O Turbo-Agent está em um estágio avançado e bem modularizado; o ganho agora vem de consolidar `tools.ts`, eliminar duplicação de configs de LLM nos nós e clarear explicitamente o acesso host vs. sandbox nas ferramentas.
