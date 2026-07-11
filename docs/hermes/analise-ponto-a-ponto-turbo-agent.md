# Análise ponto a ponto: turbo-agent vs. vídeo HARNESS

Baseado no vídeo **"HARNESS: What makes an AI AGENT actually work (FULL CLASS)"** e na análise do código fonte do projeto, esta documentação avalia ponto a ponto o que já está excelente, o que pode ser ajustado e as prioridades de implementação.

---

## 1. Base Arquitetônica: LLM + Harness

### ✅ O que já está EXCELENTE
- **LangGraph como harness**: `src/graph/builder.ts` mostra uma arquitetura de estados bem estruturada com `explorerNode`, `architectNode`, `coderNode`, `qaNode` e `toolNode`
- **Separação clara**: LLM (`src/llmClient.ts`) está separado de ferramentas (`src/tools.ts`), memória (`src/memory.ts`, `src/memoryVector.ts`), segurança (`src/securityManager.ts`) e audit (`src/audit.ts`)
- **Eventos**: `src/agent.ts` tem `agentEvents` como EventEmitter, permitindo desacoplamento

### ⚠️ O que pode ser ajustado
**Contexto efêmero não está separado**
- Em `src/agent.ts` linha 34: `buildSystemPrompt(this.persona)` injeta contexto dinâmico, mas não há distinção clara entre:
  - **Contexto persistente** (system prompt, memória de longo prazo)
  - **Contexto efêmero** (resultado de uma tool call que é usada só naquele passo)
- **Sugestão**: Adicionar um campo `ephemeralContext` no `AgentState` que é limpo após cada step, evitando poluir a memória permanente

---

## 2. Especificação de Ferramentas (Tool Specs)

### ✅ O que já está EXCELENTE
- **MCP nativo**: `src/mcp/client.ts` e `src/mcp/manifest.ts` mostram integração com Model Context Protocol
- **Validação Zod**: `src/tools.ts` linha 106 importa `zodToJsonSchema`, mostrando que tools são validadas
- **RBAC granular**: `src/permissions.ts` tem níveis claros (`read`, `network`, `write`, `execute`, `dangerous`) e `requiresApproval` por tool
- **ToolRegistry**: `src/tools.ts` linha 14 mostra `backgroundProcesses` gerenciado, indicando composição de ferramentas

### ⚠️ O que pode ser ajustado
**Tool specs sem exemplos few-shot**
- Em `src/tools.ts`, as definições de ferramentas provavelmente têm só `name`, `description`, `parameters`
- **Sugestão**: Adicionar campos `examples` e `whenNotToUse` no schema de cada tool. Exemplo:
  ```ts
  {
    name: "read_file",
    examples: [
      { input: { filePath: "./src/index.ts" }, output: "Arquivo lido com sucesso" }
    ],
    whenNotToUse: ["Quando o arquivo é binário", "Quando o caminho é absoluto fora do workspace"]
  }
  ```

**Validação de caminhos não está explícita**
- `src/tools.ts` linha 17 tem `resolveFilePath`, mas não mostra bloqueio de paths sensíveis
- **Sugestão**: Adicionar whitelist/blacklist de paths por tool no `permissions.ts`

---

## 3. Agent Loop e Controle de Fluxo

### ✅ O que já está EXCELENTE
- **Recursion limit**: `src/agent.ts` linha 17 tem `maxIterations` configurável
- **Circuit breaker**: `src/tools.ts` linha 49 mostra `consecutiveErrors` e `buildSelfHealMessage`
- **Stop conditions**: `src/graph/builder.ts` linha 22 mostra `consecutiveErrors >= 3` como condição de parada

### ⚠️ O que pode ser ajustado
**Timeout propagation não está visível**
- Não vi `deadline` ou `AbortSignal` sendo propagado para tool calls
- **Sugestão**: Adicionar `context.deadline` no estado e passar `AbortSignal.timeout(30000)` para cada tool execution

**Stop conditions limitadas**
- Apenas `consecutiveErrors >= 3` e ausência de tool calls
- **Sugestão**: Adicionar:
  - Parar se `context.tokens > 0.5 * maxContextWindow`
  - Parar se `state.stepDuration > maxStepDuration`

---

## 4. Memória e Gerenciamento de Contexto

### ✅ O que já está EXCELENTE
- **Sliding window**: `src/historyManager.ts` linha 13 tem `maxMessages`
- **Compactação**: `src/historyManager.ts` linha 83 tem `compactMemoryIfNecessary()` com sumarização
- **Memória vetorial**: `src/memoryVector.ts` tem embeddings com `@xenova/transformers` e cosine similarity
- **Metadados básicos**: `src/memory.ts` linha 3 tem `SUMMARIZER_PROMPT` que extrai `arquivos_modificados`, `comandos_executados`, `decisoes_tecnicas`

### ⚠️ O que pode ser ajustado
**Compressão usa heurística, não tokenizer real**
- `src/historyManager.ts` linha 86: `if (this.messages.length > this.maxMessages)` — é baseado em contagem de mensagens, não tokens
- **Sugestão**: Usar tokenizer do modelo para contar tokens reais antes de compactar

**Memória não está em camadas**
- Hoje é: histórico bruto → sumarizado + vetorial
- **Sugestão**: Separar em:
  - `workingMemory`: últimas N mensagens
  - `episodicMemory`: experiências específicas (já é o histórico)
  - `semanticMemory`: fatos extraídos (já é a sumarização)
  - `proceduralMemory`: tool registry (já existe implicitamente)

**Memória transitiva não implementada**
- Não vi lógica de inferência A → B → C
- **Sugestão**: Adicionar `inferRelations()` que busca conexões entre entidades na memória vetorial

---

## 5. Guardrails e Segurança

### ✅ O que já está EXCELENTE
- **Detecção de segredos**: `src/secretsDetector.ts` tem 15+ padrões (AWS, GitHub, OpenAI, Stripe, JWT, etc.)
- **RBAC**: `src/permissions.ts` tem níveis e `requiresApproval`
- **Audit logging**: `src/audit.ts` tem SQLite com WAL mode e eventos tipados
- **SecurityManager**: `src/securityManager.ts` combina permissões + detecção de segredos + aprovação humana

### ⚠️ O que pode ser ajustado
**PII brasileiro não está coberto**
- `src/secretsDetector.ts` tem padrões globais, mas falta:
  - CPF: `\b\d{3}\.\d{3}\.\d{3}-\d{2}\b`
  - CNPJ: `\b\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}\b`
  - Telefone BR: `\(\d{2}\)\s?\d{4,5}-\d{4}`
- **Sugestão**: Adicionar esses padrões em `SECRET_PATTERNS`

**Prompt injection detection é básico**
- Não vi classificador semântico, só regex/palavras-chave
- **Sugestão**: Adicionar `llmGuard` ou classificador leve local para detectar ataques sutis

**Output guardrails não estão visíveis**
- Não vi validação da resposta do LLM antes de mostrar ao usuário
- **Sugestão**: Adicionar `outputValidator` que verifica:
  - Vazamento de segredos na resposta
  - Alucinações factuais (fact-checking com RAG)
  - Conteúdo perigoso

---

## 6. Observabilidade e Debug

### ✅ O que já está EXCELENTE
- **Logging estruturado**: `src/logger.ts` tem níveis (debug, info, warn, error) e formato JSON/texto
- **Datadog**: `src/datadog.ts` tem buffer e flush automático
- **Audit**: `src/audit.ts` tem eventos tipados e SQLite

### ⚠️ O que pode ser ajustado
**Tracing não é distribuído**
- Os logs existem, mas não são spans de OpenTelemetry
- **Sugestão**: Adicionar `@opentelemetry/api` e criar spans:
  ```ts
  const span = tracer.startSpan('agent.step', {
    attributes: {
      'agent.step': state.sender,
      'agent.tools_available': tools.length,
      'agent.context_tokens': countTokens(context)
    }
  });
  ```

**Métricas semânticas não estão explícitas**
- Não vi contadores de:
  - `agent_loop_duration_seconds`
  - `tool_calls_total{status="success|error"}`
  - `tokens_used_total{type="prompt|completion"}`
- **Sugestão**: Adicionar `metrics.ts` com Prometheus ou StatsD

**Debug mode com replay não existe**
- Não vi gravação de trace completo para replay
- **Sugestão**: Adicionar `traceRecorder` que salva cada step em JSON para replay posterior

---

## 7. Multi-Agentes e Orquestração

### ✅ O que já está EXCELENTE
- **Subagentes**: `src/agent.ts` tem `isSubagent` e `invoke_subagent` nas permissions
- **MCP**: descoberta dinâmica de ferramentas
- **Fallback**: `src/llmClient.ts` provavelmente tem retry

### ⚠️ O que pode ser ajustado
**Router Agent não está explícito**
- Não vi um agente que decide qual modelo/ferramenta usar baseado em complexidade
- **Sugestão**: Criar `routerAgent.ts` que:
  - Analisa a tarefa
  - Decide modelo (barato vs. caro)
  - Decide se precisa de subagentes

**Evaluator Agent não existe**
- Não há validação de resposta final antes de entregar ao usuário
- **Sugestão**: Criar `evaluatorNode` no grafo que:
  - Verifica se a resposta responde à pergunta
  - Fact-checking básico
  - Verifica se não há conteúdo perigoso

---

## 8. Produção e Robustez

### ✅ O que já está EXCELENTE
- **Circuit breaker**: `src/tools.ts` linha 49
- **Audit logging**: SQLite com WAL
- **Datadog**: monitoramento

### ⚠️ O que pode ser ajustado
**Retry com jitter não está visível**
- Não vi lógica de retry exponencial com jitter para APIs
- **Sugestão**: Adicionar em `llmClient.ts`:
  ```ts
  const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 30000);
  ```

**Bulkhead pattern não implementado**
- Não vi isolamento de falhas por componente
- **Sugestão**: Usar pools separados:
  - `llmPool` para chamadas de modelo
  - `toolPool` para execução de ferramentas
  - `ragPool` para busca vetorial

**Graceful degradation não está explícito**
- Não vi fallback automático para modelo local se o principal falhar
- **Sugestão**: Adicionar `fallbackChain` no config:
  ```ts
  fallback: [
    { provider: 'openai', model: 'gpt-4' },
    { provider: 'ollama', model: 'llama3' },
    { provider: 'rules', model: 'simple' }
  ]
  ```

**Health checks não existem**
- Não vi endpoint `/health` ou similar
- **Sugestão**: Adicionar em `src/server.ts`:
  ```ts
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      components: {
        llm: checkLLM(),
        tools: checkTools(),
        rag: checkRAG()
      }
    });
  });
  ```

---

## 9. UX e Transparência

### ✅ O que já está BOM
- **CLI com cores**: `picocolors` em `src/logger.ts`
- **Spinners**: `ora` em `src/historyManager.ts`
- **Prompt de aprovação**: `src/promptUser.ts` (provavelmente)

### ⚠️ O que pode ser ajustado
**Streaming de pensamentos não está visível**
- Não vi stream de `` blocks ou tool calls em tempo real
- **Sugestão**: Adicionar streaming no `coderNode.ts`:
  ```ts
  const stream = await chatWithTools.stream(messages);
  for await (const chunk of stream) {
    process.stdout.write(chunk.content);
  }
  ```

**Indicadores de status não são granulares**
- Apenas "Executando ferramenta X"
- **Sugestão**: Adicionar estados:
  - `🤔 Pensando...`
  - `🔍 Buscando informação...`
  - `⚙️ Executando tool: read_file`
  - `✅ Concluído`

**Confidence scoring não existe**
- Não vi cálculo de confiança nas respostas
- **Sugestão**: Adicionar `confidence: number` no `finish_task` args

**Clarification questions não estão implementadas**
- Não vi lógica de perguntar ao usuário quando há ambiguidade
- **Sugestão**: Adicionar `askUser()` tool que pausa o loop e aguarda input

---

## 🎯 Resumo de Prioridades Revisado

### ✅ Já está EXCELENTE (não mexer)
1. Arquitetura LangGraph com estados bem definidos
2. Tool Registry com MCP e RBAC
3. Circuit breaker e recursion limit
4. Memória com compactação e RAG
5. Detecção de segredos e audit logging
6. Datadog integration

### ⚠️ Ajustes RÁPIDOS (baixo esforço, alto impacto)
1. **Adicionar PII brasileiro** em `secretsDetector.ts` (CPF, CNPJ, telefone)
2. **Adicionar timeout propagation** no agent loop
3. **Adicionar exemplos few-shot** nas tool specs
4. **Adicionar indicadores de status** granulares na UX

### 🚀 Ajustes MÉDIOS (médio esforço, alto impacto)
1. **Tracing com OpenTelemetry** + debug mode com replay
2. **Router Agent** para decisão de modelo/ferramenta
3. **Retry com jitter** + bulkhead pattern
4. **Memória em camadas** (working/episodic/semantic/procedural)
5. **Output guardrails** com fact-checking básico

### 🔮 Ajustes LONGOS (alto esforço, alto impacto)
1. **Evaluator Agent** para validação de respostas
2. **Graceful degradation** com fallback chain
3. **Tool sandboxing** com least privilege por tool
4. **Self-reflection** e meta-learning

---

## 📋 Próximos Passos Sugeridos

Se você quiser, eu posso ajudar a implementar **um por um**, começando pelos ajustes rápidos:

1. **Primeiro**: Adicionar PII brasileiro em `secretsDetector.ts` (5 minutos)
2. **Segundo**: Adicionar timeout propagation no agent loop (15 minutos)
3. **Terceiro**: Adicionar exemplos few-shot nas tool specs (20 minutos)

Qual você quer começar? 🚀
