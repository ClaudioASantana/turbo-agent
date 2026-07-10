# Plano de Melhorias - Harness AI Agent

**Data:** 2026-07-10  
**Baseado em:** Aula "HARNESS: What makes an AI AGENT actually work" + Análise do código atual

---

## 📹 Resumo do Vídeo

A aula de 1h41min cobre:
- **LLM ≠ Agente**: LLM só gera texto; agente = LLM + Harness (infraestrutura que permite agir)
- **Harness**: ferramentas, memória, guardrails, loops, orquestração
- **Context Assembly**: system prompt + histórico + prompt + contexto efêmero
- **Compressão de contexto**: heurísticas/tokenizers para não estourar a janela
- **Input Guardrails**: regex para PII/comandos destrutivos; classificador para prompt injection
- **Tool Calling**: specs claras → LLM pede → harness executa → resultado volta → loop
- **Agent Loop**: while com recursion limit e stop conditions
- **Memória**: curto/longo prazo, RAG, sumarização
- **Observabilidade**: logging estruturado, tracing, métricas
- **Multi-Agentes**: router, evaluator, retriever
- **Produção**: circuit breaker, retry/backoff, model gateway

---

## 🛠️ Status Real do Projeto (Mapeamento Completo)

### ✅ O que JÁ está implementado

#### **Multi-Agent Architecture**
- ✅ LangGraph-based state graph com 5 nós especializados (`graph/builder.ts`)
- ✅ Human-in-the-loop (HITL) com interrupts antes do coderNode
- ✅ Subagent delegation (researcher, QA, browser, generic)
- ✅ Parallel subagent execution (`invoke_parallel_subagents`)

#### **Memory & RAG**
- ✅ Short-term conversation history com compressão (`historyManager.ts`)
- ✅ Vector memory com embeddings Xenova transformers (`memoryVector.ts`)
- ✅ Semantic codebase search com Vectra (`rag.ts`)
- ✅ Core memory para regras permanentes (`coreMemory.ts`)
- ✅ Knowledge items storage

#### **Security & Guardrails**
- ✅ RBAC permissions system (`permissions.ts`)
- ✅ Secrets detection com 18 padrões (`secretsDetector.ts`)
- ✅ User approval prompts para tools perigosas
- ✅ SQLite audit logging (`audit.ts`)
- ✅ Circuit breaker (3-error limit em `agent.ts:310`)

#### **Tools (30+ ferramentas em `tools.ts`)**
- ✅ File operations (read, write, patch, multi-replace)
- ✅ Code analysis (analyze_codebase, search_files)
- ✅ Docker-sandboxed command execution
- ✅ Browser automation (Playwright)
- ✅ Web search + URL fetching
- ✅ GitOps (create_pull_request com semantic commits)
- ✅ Testing (run_unit_tests para Vitest)
- ✅ OS integration (notifications, clipboard, system stats)
- ✅ Database queries (SQLite read-only)

#### **Observability**
- ✅ Datadog log dispatcher (`datadog.ts`)
- ✅ Structured logging com JSON/text modes (`logger.ts`)
- ✅ Token usage tracking (`agent.ts:294`)
- ✅ Event emitter para UI integration (`agentEvents`)

#### **MCP Integration**
- ✅ MCP client manager (`mcp/client.ts`)
- ✅ Dynamic tool registration from MCP servers
- ✅ Schema cleaning para OpenAI compatibility

#### **Web Server**
- ✅ Express REST API (`server/server.ts`)
- ✅ Server-Sent Events (SSE) para streaming (`server/sse.ts`)
- ✅ Chat, tasks, audit, agents, transcribe routes
- ✅ Telegram bot integration

#### **Advanced Features**
- ✅ Time-travel debugging (`/rewind` command em `agent.ts:117`)
- ✅ Goal mode (`/goal` para unlimited iterations)
- ✅ Grill-me mode (`/grill-me` para planning questions)
- ✅ Persistent PTY terminal (`terminal.ts`)
- ✅ Dynamic context injection (Git, OS, file tree em `context.ts`)
- ✅ Custom agents plugin system (`customAgents.ts`)

---

### 🟡 Gaps Identificados (vs Recomendações do Vídeo)

| Tema | Estado real no código | Gap real |
|---|---|---|
| LLM + Harness (LangGraph) | `graph/builder.ts` - 5 nós especializados | ✅ Nenhum |
| Context Assembly | `promptBuilder.ts` + `historyManager.ts` | 🟡 Compressão só por contagem de msgs (não por tokens) |
| Agent Loop + recursion limit | `agent.ts:185` - `streamEvents` com `recursionLimit` | 🟡 Stop conditions só por `consecutiveErrors >= 3` |
| Input Guardrails | `secretsDetector.ts` - 18 padrões para **output** | ❌ Sem guardrail de **input** (PII, prompt injection) |
| Circuit Breaker | `agent.ts:310` - 3 erros consecutivos | 🟡 Funciona, mas sem backoff exponencial |
| Memória multi-camada | `memoryVector.ts`, `rag.ts`, `coreMemory.ts` | 🟡 Sem metadados estruturados (tools, arquivos) |
| Observabilidade | `datadog.ts` - só log shipping | 🟡 Sem tracing por step, sem métricas de tool |
| Multi-agentes | `graph/nodes/` - explorer, architect, coder, qa | 🟡 Sem router por complexidade, sem evaluator |
| Produção | Docker + PostgreSQL + circuit breaker | 🟡 Sem health check endpoint, retry com backoff |

---

## 📋 Plano de Implementação (4 Fases)

### **Fase 1 - Input Guardrails** `src/inputGuardrails.ts`

**Problema:** O `secretsDetector.ts` atual só roda no **output** (antes de salvar arquivos). O vídeo enfatiza guardrails no **input** - antes de enviar ao LLM.

**Solução:**
- Regex determinístico para PII brasileiro:
  - CPF: `\d{3}\.\d{3}\.\d{3}-\d{2}`
  - CNPJ: `\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}`
  - Email, telefones
- Bloqueio de comandos destrutivos no input:
  - `DROP TABLE`, `rm -rf /`, `DELETE FROM` sem WHERE
  - `sudo rm`, `dd if=/dev/zero`
- Score de risco para prompt injection (heurístico):
  - "ignore previous instructions"
  - "você é agora"
  - "system prompt"
  - "forget all"
- Hook no `agent.ts:runStep()` antes de enviar ao grafo

**Arquivos a criar/modificar:**
- `src/inputGuardrails.ts` (novo)
- `src/agent.ts` (adicionar chamada em `runStep()` antes de `streamEvents`)

**Referência no código existente:**
```typescript
// agent.ts:168 - ADICIONAR AQUI:
if (userPrompt) {
  // NOVO: Input Guardrails
  const guardrailResult = checkInputGuardrails(userPrompt);
  if (guardrailResult.blocked) {
    this.agentEvents.emit("error", guardrailResult.reason);
    return guardrailResult.reason;
  }
  
  initialMessages.push(new HumanMessage(userPrompt));
}
```

---

### **Fase 2 - Compressão de Contexto Inteligente** `src/historyManager.ts`

**Problema:** A compressão atual no `historyManager.ts` remove mensagens por contagem (`maxMessages`). O vídeo recomenda sumarização baseada em **tokens**.

**Solução:**
- Token counting estimado com tiktoken-lite ou fórmula `chars/4`
- Threshold em 50% da janela do modelo:
  - Claude 3.5 Sonnet: 200k tokens → sumariza ao atingir ~100k
  - GPT-4: 128k tokens → sumariza ao atingir ~64k
- Sumarização via LLM: prompt específico para comprimir histórico mantendo:
  - Decisões importantes
  - Erros recentes
  - Contexto de arquivos modificados
- Preservar sempre:
  - System prompt
  - Última mensagem do usuário
  - Últimas 3 mensagens (contexto imediato)

**Arquivos a modificar:**
- `src/historyManager.ts` (expandir método `compressHistory()`)
- `src/memory.ts` (integrar sumarizador com LLM call)

**Referência no código existente:**
```typescript
// historyManager.ts:80 - EXPANDIR:
private async compressHistory() {
  // ATUAL: Remove até maxMessages
  while (this.messages.length > this.maxMessages) {
    // Remove a segunda mensagem (preserva system)
    this.messages.splice(1, 1);
  }
  
  // NOVO: Comprimir por tokens
  const totalTokens = this.estimateTokens(this.messages);
  const maxTokens = this.getModelMaxTokens() * 0.5; // 50% da janela
  
  if (totalTokens > maxTokens) {
    const compressed = await this.summarizeWithLLM(this.messages);
    this.messages = [this.messages[0], ...compressed]; // preserva system
  }
}
```

---

### **Fase 3 - Observabilidade Estruturada** `src/tracer.ts`

**Problema:** O Datadog atual recebe logs genéricos. O vídeo mostra tracing por step: `thought → tool → result → duration`.

**Solução:**
- `src/tracer.ts`: classe `StepTracer` que abre/fecha spans por evento do grafo
- Capturar em cada step:
  - Nó atual (explorer, architect, coder, qa)
  - Tool chamada (nome, argumentos, resultado)
  - Duração em ms
  - Tokens consumidos (input + output)
  - Erro/sucesso
- Emitir para o `agentEvents` (já existe em `agent.ts`) com evento `"trace"`
- Modo debug (`/debug on`) que loga o ciclo completo de decisão no terminal
- Métricas agregadas por sessão:
  - Taxa de uso por tool (top 10)
  - Duração média por nó
  - Taxa de erro por tool

**Arquivos a criar/modificar:**
- `src/tracer.ts` (novo)
- `src/agent.ts` (hookar nos eventos de stream: `on_tool_start`, `on_tool_end`, `on_chat_model_end`)
- `src/server/routes/audit.ts` (expor endpoint `/audit/metrics`)

**Estrutura do Tracer:**
```typescript
// tracer.ts
export interface TraceSpan {
  spanId: string;
  node: string;
  tool?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tokens?: { input: number; output: number };
  error?: string;
}

export class StepTracer {
  private spans: TraceSpan[] = [];
  
  startSpan(node: string, tool?: string): string { /* ... */ }
  endSpan(spanId: string, result: { tokens?, error? }): void { /* ... */ }
  getMetrics(): { totalDuration: number; toolUsage: Record<string, number> } { /* ... */ }
}
```

**Hook em `agent.ts`:**
```typescript
// agent.ts:252 - ADICIONAR:
} else if (event.event === "on_tool_start") {
  const spanId = tracer.startSpan(event.metadata.langgraph_node, event.name);
  // ...
} else if (event.event === "on_tool_end") {
  tracer.endSpan(spanId, { error: event.data.error });
  // ...
}
```

---

### **Fase 4 - Metadados na Memória** `src/memoryVector.ts`

**Problema:** A memória vetorial salva só texto (`content: string`). O vídeo sugere metadados estruturados para retrieval mais preciso.

**Solução:** Adicionar à estrutura de memória:
```typescript
{
  content: string,
  timestamp: string,
  tools_used: string[],      // quais tools foram invocadas
  files_modified: string[],  // arquivos tocados no episódio
  success: boolean,          // se a tarefa foi concluída
  node_path: string[],       // caminho pelos nós do grafo (ex: ["explorer", "architect", "coder"])
  error?: string             // se houve erro, qual foi
}
```

**Benefícios:**
- Queries como "lembra quando editaste o arquivo X?"
- "Qual tool falhou em tarefas similares?"
- "Mostra episódios onde o architect planejou algo relacionado a autenticação"

**Arquivos a modificar:**
- `src/memoryVector.ts` (expandir interface `MemoryEntry`)
- `src/graph/nodes/toolNode.ts` (registrar metadata ao salvar memória)
- `src/tools.ts` (tool `memorize` aceitar metadata)

**Exemplo de uso:**
```typescript
// memoryVector.ts
interface MemoryEntry {
  id: string;
  content: string;
  embedding: number[];
  timestamp: string;
  metadata: {
    tools_used: string[];
    files_modified: string[];
    success: boolean;
    node_path: string[];
    error?: string;
  };
}

// Retrieval aprimorado:
async searchWithMetadata(query: string, filters?: {
  tools?: string[],
  files?: string[],
  success?: boolean
}): Promise<MemoryEntry[]> {
  // Busca semântica + filtro por metadados
}
```

---

## 🎯 Ordem de Implementação Sugerida

```
1. Fase 1 (Input Guardrails)
   ↓
2. Fase 3 (Tracing)
   ↓
3. Fase 2 (Context Compression)
   ↓
4. Fase 4 (Memory Metadata)
```

**Justificativa:**
1. **Guardrails primeiro**: Protegem antes de qualquer coisa (segurança crítica)
2. **Tracing em seguida**: Precisamos observar o comportamento atual para calibrar os thresholds de compressão
3. **Compressão**: Usa os dados do tracing para definir limites de tokens
4. **Memória com metadados por último**: Depende do tracing para coletar os dados certos (tools, duration, errors)

---

## 📊 Comparação: Estado Atual vs Vídeo

| Funcionalidade | Vídeo recomenda | turbo-agent atual | Ação |
|---|---|---|---|
| Input Guardrails (PII, injection) | ✅ Crítico | ❌ Ausente | Implementar Fase 1 |
| Output Guardrails (secrets) | ✅ Crítico | ✅ 18 padrões | Nenhuma |
| Context Compression (tokens) | ✅ Essencial | 🟡 Por contagem | Melhorar Fase 2 |
| Circuit Breaker | ✅ Essencial | ✅ 3 erros | Adicionar backoff |
| Tracing por Step | ✅ Observability | 🟡 Logs genéricos | Implementar Fase 3 |
| Memory Metadata | ✅ RAG avançado | 🟡 Só texto | Implementar Fase 4 |
| Multi-Agent Router | ✅ Eficiência | 🟡 Fixo (LangGraph) | Futuro |
| Evaluator Agent | ✅ Qualidade | ❌ Ausente | Futuro |

---

## 🔥 Observações Finais

### **O turbo-agent já é avançado**
- Arquitetura enterprise-grade (LangGraph, PostgreSQL, HITL)
- 30+ tools cobrindo file ops, web, multi-agent, GitOps
- Segurança robusta (RBAC, secrets detection, audit logging)
- Infraestrutura production-ready (Docker, API REST, Telegram bot)

### **Gaps são refinamentos, não falhas estruturais**
- Input guardrails são o único gap crítico (segurança)
- Os demais são melhorias de eficiência/observabilidade

### **Priorização**
Se tiver que escolher apenas 1 fase: **Fase 1 (Input Guardrails)**  
Se tiver recursos para 2: **Fase 1 + Fase 3 (Tracing)**

---

**Próximos Passos:** Definir qual fase implementar primeiro.
