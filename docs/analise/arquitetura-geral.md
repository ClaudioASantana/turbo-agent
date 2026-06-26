# Arquitetura Geral do Turbo-Agent

## Componentes Principais

### 1. `src/index.ts` — Entrypoint do CLI
- Inicia o cliente LLM via `.env`.
- Carrega MCP se houver manifesto.
- Cria instância do agente e entra no loop interativo.

### 2. `src/server.ts` — Entrypoint do Servidor
- Expõe endpoints HTTP para chat, aprovação, cancelamento, transcrição, tarefas e auditoria.
- Fornece streaming SSE para UI.
- Integra Telegram como canal paralelo.
- Registra agentes customizados dinamicamente.

### 3. `src/agent.ts` — Núcleo Orquestrador (LangGraph)
- Monta o grafo com 5 nós: `explorerNode`, `architectNode`, `coderNode`, `qaNode`, `toolNode`.
- Usa SQLite (`SqliteSaver`) para checkpoint/persistência.
- Injeta system prompt e gerencia memória.
- Faz streaming de tokens, tratamento de pausa (HITL) e circuit breaker.
- Implementa `/rewind` para retrocesso de estado.

### 4. `src/tools.ts` — Registry de Ferramentas
- Centraliza todas as ferramentas: `read_file`, `write_file`, `replace_in_file`, `patch_file`, `run_command`, etc.
- Converte schemas Zod para formato OpenAI/MCP.
- Gerencia processos em background (`start_background_command`, `read_process_logs`, `stop_background_process`).
- Inclui `web_search`, `fetch_url`, ferramentas de browser e análise de código.

### 5. `src/llmClient.ts` — Cliente LLM
- Inicializa o cliente OpenAI.
- Prioriza `OPENAI_API_KEY`, senão usa `LLM_BASE_URL` ou um IP fixo (`172.24.160.1:18080/v1`).
- Fallback de chave "llama.cpp" indica integração com modelos locais.

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

## Pontos Críticos de Risco

- **Concentração em `src/agent.ts`**: todo o grafo, prompts, streaming e controle está no mesmo arquivo.
- **Defaults agressivos**: `maxIterations=256`, IP fixo de LLM local.
- **Mistura de responsabilidades**: CLI + server + MCP + Telegram estão fortemente acoplados.
- **Superfície de ataque**: Escrita livre no filesystem + execução de shell sem escopo restrito.

## Diretrizes para Refatoração

1. Separar os nós do grafo em arquivos próprios (`src/graph/nodes/`).
2. Isolar o cliente LLM em uma fábrica com configs claramente declaradas.
3. Modularizar o server (`src/server/routes/`, `src/server/telegram.ts`).
4. Simplificar `/rewind` e `/goal` para usar mecânica de snapshot mais explícita.
5. Revisar a lógica de permissão para auditoria mais granular.