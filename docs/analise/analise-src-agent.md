# Analise de 

> Atualizado em: 26/06/2026 -- Reflete o codigo-fonte atual (319 linhas).

## O que ele faz (estado atual)

Apos a refatoracao,  e o **controlador de ciclo de vida** do agente. Responsabilidades atuais:

- Criar e inicializar a instancia do agente (HistoryManager, SqliteSaver, threadId, grafo)
- Expor o metodo principal  com streaming de eventos
- Controlar , , 
- Fazer mapeamento entre historico legado (JSON) e mensagens do LangGraph
- Emitir eventos via  (EventEmitter global usado pelo SSE e Telegram)

## O que foi extraido (refatoracao concluida)

| O que era em agent.ts | Onde esta agora |
|---|---|
| Os 5 nos do grafo | src/graph/nodes/ |
| buildGraph() | src/graph/builder.ts |
| AgentState | src/graph/state.ts |
| normalizeMessages() | src/graph/state.ts |
| buildSelfHealMessage(), truncateResult() | src/graph/utils.ts |
| validateBuildAfterWrite() (tsc) | src/graph/nodes/buildValidator.ts |

## Responsabilidades restantes em agent.ts

### 1. Constructor e inicializacao (linhas 24-41)
- Le config via getConfig()
- Cria HistoryManager com maxMessages
- Inicializa SqliteSaver.fromConnString(.langgraph_memory.db)
- Gera threadId = session_<Date.now()>
- Compila grafo via createAgentGraph(isSubagent, checkpointer)

### 2. Mapeamento de mensagens (linhas 59-88)
- mapToLangChainMessages() -- converte historico JSON para HumanMessage/AIMessage
- mapFromLangChainMessages() -- converte de volta, limpando <think>, JSON bruto de tool calls

### 3. Controle de plano (linhas 90-125)
- abortPlan() -- injeta mensagem de cancelamento e retoma com runStep(null)
- rewindState(steps) -- itera getStateHistory(), cria nova thread e aplica snapshot

### 4. runStep() -- execucao principal (linhas 127-318)
- Intercepta slash commands: /goal (maxIterations -> 100) e /grill-me
- Detecta se e a primeira execucao da thread (isFirstRun)
- Injeta HumanMessage no estado e chama graph.streamEvents()
- Streaming: on_chat_model_stream (tokens), on_tool_start, on_tool_end, on_chain_end
- Detecta pausa (HITL) via finalSnapshot.next
- Fallback: se nenhum token foi streamado, pega ultima mensagem do estado diretamente
- Salva historico legado em JSON ao final e emite agentEvents.emit(end)

## Sinais de risco remanescentes

- [DEBUG STREAM END] msg: -- log de debug exposto em producao (linha 208)
- abortPlan() internamente chama runStep(null) -- comportamento acoplado e pouco obvio
- Historico legado (JSON) e checkpoint LangGraph (SQLite) coexistem -- duas fontes de verdade
- Fallback de token pode mascarar problemas de streaming do proxy LLM

## Resumo em uma frase

 foi corretamente enxugado para controlar apenas o ciclo de vida; os riscos agora sao os logs de debug em producao e a coexistencia de dois sistemas de persistencia (JSON + SQLite).
