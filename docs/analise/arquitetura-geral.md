# Arquitetura Geral do Turbo-Agent

> Atualizado em: 26/06/2026 — Reflete o código-fonte atual. Divergências com versões anteriores estão marcadas com ⚠️.

## Componentes Principais (Estado Atual)

### 1. `src/index.ts` — Entrypoint do CLI
- Inicia o cliente LLM via `.env`.
- Carrega MCP se houver manifesto.
- Cria instância do agente e entra no loop interativo.

### 2. `src/server.ts` — Entrypoint do Servidor
- Expõe endpoints HTTP para chat, aprovação, cancelamento, transcrição, tarefas e auditoria.
- Fornece streaming SSE para UI.
- Integra Telegram como canal paralelo.
- Registra agentes customizados dinamicamente.

### 3. `src/agent.ts` — Orquestrador (ciclo de vida) + `src/graph/` — Grafo LangGraph ⚠️ REFATORADO
- **Os nós do grafo foram extraídos** para `src/graph/nodes/` (explorerNode, architectNode, coderNode, qaNode, toolNode + buildValidator).
- `src/agent.ts` agora é responsável apenas por: ciclo de vida, `runStep()`, `rewindState()`, `abortPlan()`, `cancel()`, streaming de eventos e mapeamento de histórico legado.
- O grafo é criado via `createAgentGraph()` em `src/graph/builder.ts`.
- `AgentState` e `normalizeMessages()` estão em `src/graph/state.ts`.
- Usa `SqliteSaver` para checkpoint persistente em `.langgraph_memory.db`.
- Circuit breaker após 3 erros consecutivos. Suporte a slash commands: `/goal`, `/grill-me`.

### 4. `src/tools.ts` — Registry de Ferramentas (1086 linhas)
- 35+ ferramentas registradas via Zod: arquivo, execução, internet, browser, sub-agentes, GitOps, sistema.
- Converte schemas Zod para formato OpenAI.
- `run_command` executa dentro de **Docker sandbox** via `AgentTerminal` (node-pty).
- Ferramentas de arquivo (`read_file`, `write_file`, etc.) rodam no **host** com acesso irrestrito.
- Inclui: `semantic_search` (RAG), `create_pull_request` (GitOps), `preview_file_changes`, `clipboard_manager`, `system_stats`, `add_core_rule`, `invoke_browser_subagent`.

### 5. `src/llmClient.ts` — Cliente LLM ⚠️ ATUALIZADO
- Inicializa o cliente OpenAI com `initLLM()`.
- Prioriza `OPENAI_API_KEY` (usa API oficial sem baseURL).
- Fallback: `LLM_BASE_URL` do env → `undefined` (sem IP hardcoded na produção).
- O IP fixo `http://127.0.0.1:18080/v1` existe apenas nos **arquivos de teste** (`tests-scratch/`).
- Chave: `OPENAI_API_KEY` → `LLM_API_KEY` → `OPENROUTER_API_KEY` → `"llama.cpp"` (fallback para modelos locais).

### 6. `src/config.ts` — Configuração Global
- Carrega `.agentrc` com defaults.
- Controla limites de iteração, auditoria, permissões, detecção de segredos e integração Datadog.
- Força validação de chave de API dependendo do provedor.

### 7. `src/promptBuilder.ts` — System Prompt
- Monta o prompt base com placeholders para contexto dinâmico, memória e schemas de ferramentas.
- Injeta regras específicas por persona (`reviewer`, `qa`, `researcher`, `browser`).

### 8. `src/securityManager.ts` — Gatekeeper
- Autoriza cada ferramenta antes da execução.
- Bloqueia ferramentas perigosas em subagentes.
- Detecta segredos e aborta se configurado para bloquear escrita.
- Solicita aprovação humana para ações críticas.

### 9. `src/audit.ts` — Trilha de Auditoria
- Grava tudo em SQLite (`agent_audit.db`).
- Sanitiza argumentos para não expor segredos.
- Fornece leitura e estatísticas para dashboards.

## Fluxo de Execução

1. **Início**: CLI (`index.ts`) ou Servidor (`server.ts`) instancia `Agent`.
2. **Prompt**: Usuário envia mensagem.
3. **Explorer**: Busca contexto relevante, injeta memória vetorial.
4. **Architect** (se necessário): Cria plano técnico.
5. **Coder**: Executa ferramentas seguindo o plano.
6. **ToolNode**: Executa ações validadas + self-healing TypeScript.
7. **QA** (se houver finalAnswer): Executa testes, valida ou rejeita.
8. **Segurança**: A cada tool call, `SecurityManager.authorize` valida permissões e segredos.
9. **Auditoria**: Tudo é logado via `audit.ts`.
10. **Resposta**: Retorna ao usuário via SSE ou stdout.

## Pontos Críticos de Risco (Estado Atual)

- **`src/tools.ts` com 1086 linhas** — ainda o maior ponto de acoplamento restante.
- **Config de LLM duplicada** — cada nó (`explorerNode`, `architectNode`, `coderNode`, `qaNode`) instancia seu próprio `ChatOpenAI` com as mesmas variáveis de ambiente. Risco de divergência silenciosa.
- **Acesso irrestrito ao host** — ferramentas de arquivo rodam no host sem sandboxing. Apenas `run_command` usa Docker.
- **`UI_MODE=true` auto-aprova** ferramentas perigosas silenciosamente no modo web.
- **Logs de debug** (`console.log`) espalhados nos nós em produção.
- **`/goal` eleva `maxIterations` para 100** sem aviso explícito ao usuário.

## O que já foi resolvido (refatorações concluídas)

1. ✅ Nós do grafo extraídos para `src/graph/nodes/` — `agent.ts` ficou enxuto.
2. ✅ Servidor modularizado em `src/server/routes/` com routers independentes.
3. ✅ IP hardcoded `172.24.160.1:18080/v1` removido de produção — apenas em testes.
4. ✅ `maxIterations` padrão corrigido de 256 para **32**.
5. ✅ Auditoria migrada de `.jsonl` para **SQLite com modo WAL**.
6. ✅ Terminal migrado de `exec` para **node-pty + Docker sandbox**.
7. ✅ Sistema de permissões com **cache granular** (por ferramenta, arquivo ou diretório).

## Próximas prioridades

1. Extrair configuração de LLM para um helper compartilhado em `src/graph/llmFactory.ts`.
2. Dividir `src/tools.ts` em módulos por domínio (file, shell, web, browser, memory, git).
3. Remover `console.log` de debug dos nós — usar `Logger.debug`.
4. Clarificar explicitamente no system prompt a distinção host vs. sandbox para o LLM.
5. Avaliar se `UI_MODE=true` deve continuar auto-aprovando ou passar pelo HITL da UI.
