# Análise de `src/server.ts`

## Visão geral
`src/server.ts` é a camada web do Turbo-Agent. Ela expõe o agente por HTTP, streaming SSE, endpoints administrativos, integração com Telegram, transcrição de áudio e gerenciamento de agentes customizados.

## Bloco 1 — Setup da aplicação
- Importa `express`, `cors`, `multer`, filesystem, paths, o agente, MCP, tools, LLM e Telegram.
- Cria o `app`, habilita CORS e JSON, configura upload para `os.tmpdir()`.
- Define `PORT` e habilita `UI_MODE`.

**Responsabilidade:** preparar o servidor e seu ambiente de execução.

## Bloco 2 — Inicialização do agente e Telegram
- Cria uma instância única de `Agent`.
- Inicia o bot do Telegram em segundo plano.

**Responsabilidade:** integrar o mesmo núcleo de agente ao modo web e ao Telegram.

## Bloco 3 — Endpoint `/api/chat`
- Recebe `prompt` e `context`.
- Suporta `/rewind` diretamente na API.
- Injeta metadado efêmero sobre arquivo ativo e workspace.
- Se o workspace mudar, faz `chdir` e reconfigura terminal.
- Emite eventos e chama `agent.runStep()`.

**Responsabilidade:** principal ponto de entrada para interação web com o agente.

## Bloco 4 — Aprovação, cancelamento e transcrição
### `/api/approve`
- Retoma ou aborta o plano após decisão humana.

### `/api/cancel`
- Cancela execução ativa.

### `/api/transcribe`
- Recebe áudio, renomeia arquivo temporário e envia ao Whisper.

**Responsabilidade:** controle humano e entrada multimodal.

## Bloco 5 — Tarefas em background
### `GET /api/tasks`
- Lista processos em segundo plano.

### `GET /api/tasks/:id/logs`
- Retorna logs do processo.

### `DELETE /api/tasks/:id`
- Encerra e remove processo.

**Responsabilidade:** observabilidade operacional dos comandos em background.

## Bloco 6 — Auditoria
### `GET /api/audit`
- Retorna logs e estatísticas do audit log.

**Responsabilidade:** dashboard de rastreabilidade.

## Bloco 7 — Streaming SSE
### `/api/stream`
- Abre stream SSE.
- Inscreve listeners nos eventos `agentEvents`.
- Emite `token`, `system`, `tool_start`, `tool_end`, `pause`, `error`, `end`, `open_artifact` e `open_diff`.
- Remove listeners no fechamento da conexão.

**Responsabilidade:** canal em tempo real entre o agente e a UI.

## Bloco 8 — Agentes customizados
### `GET /api/agents`
- Lista agentes customizados.

### `POST /api/agents`
- Cria ou atualiza agentes.
- Re-registra tools dinamicamente.

### `DELETE /api/agents/:id`
- Remove agente salvo.

**Responsabilidade:** extensão dinâmica do conjunto de agentes/tools.

## Bloco 9 — Inicialização do servidor
- `startServer()` carrega MCP manifest, inicia servidores MCP, registra agentes customizados e sobe o Express.
- No final chama `startServer()`.

**Responsabilidade:** bootstrap final do modo web.

## Onde está a complexidade
1. **`/api/chat`** — mistura prompt, contexto, rewind, chdir, terminal e chamada ao agente.
2. **Streaming SSE** — forte acoplamento com o barramento global de eventos do agente.
3. **Agentes customizados** — re-registro dinâmico de tools dentro do servidor.
4. **Inicialização MCP** — ocorre junto ao bootstrap web e mistura responsabilidades de runtime.

## Sinais de risco
- `server.ts` faz muita coisa ao mesmo tempo: API, streaming, Telegram, auditoria, transcrição e gerenciamento de processos.
- `chdir` global por request é sensível e pode afetar outros fluxos.
- A API expõe endpoints que controlam execução local e processos em background.
- O SSE depende de listeners globais; se houver vazamento, isso pode acumular.
- Agentes customizados afetam registry de tools em runtime, o que aumenta o risco de estado inconsistente.

## Leitura prática
Se o objetivo for simplificar, os cortes mais naturais são:
1. separar o bootstrap do servidor das rotas;
2. mover rotas em módulos por domínio;
3. isolar streaming SSE em um adaptador próprio;
4. separar Telegram do servidor HTTP;
5. encapsular o controle de workspace e terminal.

## Resumo em uma frase
`src/server.ts` é a face web do Turbo-Agent, mas também um ponto de acúmulo de responsabilidades de runtime, integração e controle operacional.
