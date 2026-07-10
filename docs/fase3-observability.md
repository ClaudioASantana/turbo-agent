# Fase 3 - Observability (Tracing Estruturado)

**Status:** ✅ Implementado e testado  
**Data:** 2026-07-10  
**Arquivos criados:** 3 (tracer, testes, rotas)

## O que foi implementado

Tracing estruturado captura **cada passo** da execução do agente: thought → tool → result → duration. Permite observar:

1. **Performance per step**
   - Qual nó leva mais tempo?
   - Qual tool é mais lenta?
   - Taxa de erro por component

2. **Token consumption**
   - Inputs/outputs por step
   - Agregação total
   - Detecção de blowup de tokens

3. **Execution flow visualization**
   - Sequência completa de nós e tools
   - Nested spans (parent-child relationships)
   - Erro e recuperação

4. **Metrics aggregation**
   - Node metrics: count, totalDuration, errorCount
   - Tool metrics: idem
   - Total tokens: input + output

---

## Arquivos criados

### 1. `src/tracer.ts` (396 linhas)

**Classes:**
- `StepTracer`: Gerencia spans para uma sessão
  - `startSpan(node, tool?, metadata?)`: Abre um span
  - `endSpan(spanId, {tokens, error}?)`: Fecha e registra duração
  - `getCurrentSpan()`: Retorna span no topo da stack
  - `addMarker(marker, data?)`: Adiciona evento ao span atual
  - `getSpans()`: Lista todos os spans
  - `getMetrics()`: Calcula agregações
  - `generateReport()`: Relatório legível em texto
  - `flush()`: Envia para Datadog + Logger

**Global managers:**
- `createTracer(threadId)`: Cria ou retorna tracer global
- `getTracer(threadId)`: Recupera tracer existente
- `removeTracer(threadId)`: Remove da memória (cleanup)

**Interfaces:**
```typescript
interface TraceSpan {
  spanId: string;
  traceId: string;
  threadId: string;
  node: string;
  tool?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tokens?: { input: number; output: number };
  error?: { message: string; type: string };
  metadata?: Record<string, any>;
}

interface TraceMetrics {
  totalDuration: number;
  nodeMetrics: Record<string, { count, totalDuration, errorCount }>;
  toolMetrics: Record<string, { count, totalDuration, errorCount }>;
  totalTokens: { input: number; output: number };
}
```

### 2. `src/tests/tracer.test.ts` (247 linhas)

Suite de 18 testes:

```
✅ Span Management (5 testes)
  • Create span with properties
  • End span and calculate duration
  • Track tool execution
  • Handle token tracking
  • Handle error tracking

✅ Span Stack Management (1 teste)
  • Maintain span stack for nested operations

✅ Markers (2 testes)
  • Add markers to current span
  • Ignore marker if no current span

✅ Metrics Calculation (4 testes)
  • Calculate node metrics
  • Calculate tool metrics
  • Aggregate token counts
  • Track error rates

✅ Report Generation (1 teste)
  • Generate readable report

✅ Global Tracer Management (3 testes)
  • Create and retrieve tracers globally
  • Reuse existing tracer
  • Remove tracer from global store

✅ Span ID Generation (1 teste)
  • Generate unique span IDs

✅ Metadata Handling (1 teste)
  • Store and preserve metadata
```

**Resultado:** 18/18 testes passando ✅

### 3. `src/server/routes/traces.ts` (89 linhas)

4 endpoints REST:

```typescript
GET /traces/:threadId
  → Retorna spans completos + metrics + relatório

GET /traces/:threadId/metrics
  → Apenas métricas agregadas (JSON)

GET /traces/:threadId/report
  → Apenas relatório (text/plain)

GET /traces/:threadId/spans
  → Apenas spans detalhados (JSON)
```

---

## Arquivos modificados

### `src/agent.ts`

**Adições:**
- Import: `import { createTracer, removeTracer, getTracer } from "./tracer";`
- `runStep()`: Inicializa tracer no começo
- Event `on_chain_start`: Abre span para cada nó
- Event `on_chat_model_end`: Registra tokens no span
- Event `on_tool_start`: Abre span para tool
- Event `on_tool_end`: Fecha span da tool
- Event `on_chain_end`: Gera relatório + flush

**Fluxo de tracing:**
```
runStep() inicia
  ↓
tracer = createTracer(threadId)
  ↓
Para cada event do LangGraph:
  on_chain_start → startSpan(node)
  on_chat_model_end → endSpan(tokens={input, output})
  on_tool_start → startSpan('tool', toolName)
  on_tool_end → endSpan()
  on_chain_end → tracer.flush() + generateReport()
  ↓
finally: removeTracer(threadId)
```

---

## Comportamento em Ação

### Exemplo 1: Execução Normal

```
┌─ Trace ID: trace_session_1688046000123
├─ Thread ID: session_1688046000123
├─ Total Duration: 2847ms
├─ Total Spans: 7
├─ Total Tokens: Input=1250 Output=850
│
├─ Node Breakdown:
│  ├─ explorer: 1 calls, 420ms total, 420ms avg, 0% errors
│  ├─ architect: 1 calls, 380ms total, 380ms avg, 0% errors
│  ├─ coder: 1 calls, 1240ms total, 1240ms avg, 0% errors
│  └─ qa: 1 calls: 190ms total, 190ms avg, 0% errors
│
└─ Tool Breakdown (Top 10):
   ├─ analyze_codebase: 1 calls, 420ms total, 420ms avg, 0% errors
   ├─ read_file: 3 calls, 580ms total, 193ms avg, 0% errors
   ├─ write_file: 1 calls, 220ms total, 220ms avg, 0% errors
   └─ run_command: 2 calls, 427ms total, 213ms avg, 0% errors
```

### Exemplo 2: Com Erro

```
├─ Tool Breakdown:
   ├─ read_file: 2 calls, 150ms total, 75ms avg, 50% errors
   │  └─ Error: ENOENT: file not found
```

### Exemplo 3: Markers

```
Span: explorer node
  ├─ Start: 1688046000123
  ├─ Duration: 420ms
  └─ Markers:
     ├─ context_loaded: {files: 42}
     ├─ search_completed: {results: 150}
     └─ semantic_scored: {topK: 10}
```

---

## Integração com Sistema

### 1. Datadog Integration

Cada span enviado para Datadog com:
```json
{
  "traceId": "trace_...",
  "spanId": "span_...",
  "threadId": "session_...",
  "node": "explorer",
  "tool": "analyze_codebase",
  "duration": 420,
  "tokens": { "input": 500, "output": 300 },
  "error": null,
  "metadata": { /* ... */ }
}
```

### 2. Event Emission

```typescript
agentEvents.emit("trace_report", reportText)
```

Permite UI mostrar relatório em tempo real.

### 3. Logger Integration

```
[INFO] [TRACE SUMMARY] Session complete
{
  traceId: "trace_...",
  totalDuration: 2847,
  totalSpans: 7,
  totalTokens: { input: 1250, output: 850 },
  nodes: ["explorer", "architect", "coder", "qa"],
  tools: ["analyze_codebase", "read_file", "write_file", "run_command"]
}
```

### 4. REST API

```bash
# Get full trace (spans + metrics + report)
curl http://localhost:3000/traces/session_1688046000123

# Get only metrics
curl http://localhost:3000/traces/session_1688046000123/metrics

# Get readable report
curl http://localhost:3000/traces/session_1688046000123/report

# Get detailed spans
curl http://localhost:3000/traces/session_1688046000123/spans
```

---

## Features Avançadas

### 1. Span Stack para Nesting

```typescript
tracer.startSpan("explorer")
  tracer.startSpan("tool", "web_search")
    tracer.addMarker("query_sent")
    tracer.addMarker("results_received", { count: 10 })
  tracer.endSpan()
tracer.endSpan()
```

### 2. Markers para Eventos

Adicionar checkpoints dentro de um span:

```typescript
const spanId = tracer.startSpan("architect");
tracer.addMarker("plan_start");
tracer.addMarker("plan_validated", { steps: 5 });
tracer.addMarker("plan_finalized");
tracer.endSpan(spanId);
```

### 3. Metrics Agregação

Automático:
```typescript
const metrics = tracer.getMetrics();
metrics.nodeMetrics["explorer"].count // 1
metrics.nodeMetrics["explorer"].totalDuration // 420
metrics.nodeMetrics["explorer"].errorCount // 0
metrics.toolMetrics["read_file"].count // 3
metrics.toolMetrics["read_file"].totalDuration // 580
```

### 4. Error Tracking

```typescript
tracer.endSpan(spanId, {
  error: {
    message: "ENOENT: file not found",
    type: "FileNotFoundError"
  }
});
```

Error rate calculado automaticamente:
```typescript
const errorRate = (errorCount / count) * 100
// "50% errors" se 1 de 2 falha
```

---

## Decisões de Design

### 1. **Span Stack, não Global State**

Motivo: Permite nesting e multi-threading
```
ParentSpan
  ├─ ChildSpan1
  └─ ChildSpan2 (getCurrentSpan() retorna este)
```

### 2. **Lazy Flushing**

Motivo: Não bloqueia execução
- Spans capturam apenas timestamps + metadados
- Flush acontece no final via `tracer.flush()`
- Datadog é async (não espera resposta)

### 3. **ThreadId como Chave Global**

Motivo: Multi-session support
```typescript
createTracer("session_1") // Sessão 1
createTracer("session_2") // Sessão 2
// Ambas rodam em paralelo sem interferência
```

### 4. **Report em Text, não JSON**

Motivo: Legibilidade humana
```bash
curl http://localhost:3000/traces/.../report
# Retorna formatado como tabelas ASCII
```

Mas spans + metrics retornam JSON para máquinas.

### 5. **No Storage Persistente**

Motivo: Spans vivos apenas durante sessão
- Remove tracer ao fim
- Para histórico: enviar para Datadog/ELK
- Dados em memória, não em disco

---

## Métricas Importantes

### Por Node

```
explorer: 1 calls, 420ms total, 420ms avg, 0% errors
```

- **calls**: quantas vezes foi invocado
- **totalDuration**: soma de todas as execuções
- **avg**: tempo médio por call
- **errors**: taxa de falhas

### Por Tool

```
analyze_codebase: 1 calls, 420ms total, 420ms avg, 0% errors
read_file: 3 calls, 580ms total, 193ms avg, 0% errors
```

Mesmas métricas, mas per-tool.

### Tokens

```
Total Tokens: Input=1250 Output=850
```

- Agregação de todos os spans
- Permite detectar token explosion
- LLM pricing estimation

---

## Debugging com Tracer

### Mode Debug

Com `debugMode: true` em config:

```
[DEBUG] [TRACE START] explorer_node (with metadata)
[DEBUG] [TRACE END] explorer_node (duration, tokens, error)
[MARKER] context_loaded (data)
```

### View Report During Execution

```bash
# Em outra janela, durante execução:
curl http://localhost:3000/traces/session_XX/metrics | jq
# Mostra métricas parciais (spans que já terminaram)
```

---

## Próximas Integrações

### Curto Prazo
- [ ] Dashboard visual de traces no `/audit` page
- [ ] Timeline visual (Gantt chart) de spans
- [ ] Flame graph de duração

### Médio Prazo
- [ ] Correlação com Datadog APM
- [ ] Alertas se tool > Xms
- [ ] Heatmap: qual tool é lento em que circunstância

### Longo Prazo
- [ ] Tracing distribuído (multi-agent)
- [ ] Trace propagation via headers (W3C trace context)
- [ ] Integração com OpenTelemetry

---

## Validação

- ✅ TypeScript: Zero errors
- ✅ Tests: 18/18 passing
- ✅ Integration: Testado com agent.ts
- ✅ API: 4 endpoints funcionais
- ✅ Datadog: Formato compatível
- ✅ Cleanup: removeTracer() em finally block

---

## Resumo Técnico

**Total de código:** ~500 linhas (tracer + testes + rotas)
**Cobertura:** Todos os nós + tools
**Overhead:** Negligível (timestamps, sem processamento pesado)
**Storage:** In-memory durante sessão
**Saída:** Console + Datadog + REST API + Events

**Arquitetura:**
```
Agent.runStep()
  ├─ createTracer(threadId)
  └─ for each LangGraph event
     ├─ on_chain_start → startSpan(node)
     ├─ on_tool_start → startSpan("tool", toolName)
     ├─ on_chat_model_end → endSpan(tokens)
     ├─ on_tool_end → endSpan()
     └─ finally → tracer.flush() + removeTracer()
```

---

**Fim da Fase 3. Status: ✅ Completa e pronta para produção.**

**Próximas:** Fase 2 (Context Compression) ou Fase 4 (Memory Metadata)?
