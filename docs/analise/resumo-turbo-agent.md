# Resumo do Turbo-Agent
O `turbo-agent` é um agente local/autônomo para desenvolvimento, operado por CLI e também por servidor web. Ele combina:
- LLM compatível com OpenAI
- orquestração com **LangGraph**
- ferramentas locais de arquivo/comando
- memória/histórico persistente
- integrações como **MCP**, **Telegram**, auditoria e transcrição

## Como ele é estruturado
- `src/index.ts` — entrypoint do modo CLI.
- `src/server.ts` — sobe API HTTP/SSE, tarefas em background, audit log, agentes customizados e Telegram.
- `src/agent.ts` — coração do sistema; modela o fluxo com nós como explorador, arquiteto e coder.
- `src/tools.ts` — registry de tools, schemas e execução.
- `src/mcp/client.ts` e `src/mcp/manifest.ts` — integração com servidores MCP.
- `src/historyManager.ts`, `src/memory.ts`, `src/coreMemory.ts`, `src/memoryVector.ts`, `src/rag.ts` — memória e recuperação de contexto.

## Fluxo principal
1. Inicializa LLM via `src/llmClient.ts`.
2. Carrega histórico/checkpoint.
3. Recebe prompt do usuário.
4. O agente monta contexto + system prompt.
5. O grafo decide exploração, planejamento e execução.
6. Se houver tool call, executa via registry.
7. Resultado volta ao contexto até responder ou pausar para aprovação humana.

## Pontos fortes
- Arquitetura ambiciosa e modular.
- CLI + servidor + SSE.
- Suporte a MCP.
- Checkpoint em SQLite.
- HITL para ações perigosas.
- Detecção de segredos e trilha de auditoria.

## Riscos / dívida técnica
- `src/agent.ts` parece concentrar muita responsabilidade.
- Há sinais de documentação desatualizada vs implementação.
- Dependência forte de config/env e alguns defaults agressivos.
- Superfície grande de execução local; exige disciplina forte de permissões.
- O repositório tem traços de evolução rápida, então pode haver acoplamentos e fluxos legados.

## Minha leitura em 1 frase
É um “OpenClaude/Cline-like” caseiro e avançado, com pegada enterprise, bastante poderoso, mas já num ponto em que clareza arquitetural e contenção de complexidade viram prioridade.
