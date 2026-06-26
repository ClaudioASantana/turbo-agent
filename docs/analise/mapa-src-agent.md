# Mapa de responsabilidades de `src/agent.ts`

## Visão geral
`src/agent.ts` é o núcleo orquestrador do projeto. Ele concentra estado, execução do grafo, prompts, segurança, auditoria, memória, tools e o fluxo de streaming até a resposta final.

## Bloco 1 — Imports e preparação inicial
**Linhas 1–21**
- Importa LangGraph, mensagens, checkpointer SQLite, cliente LLM, ferramentas, logger, auditoria, memória, segurança e parser.
- Cria `execAsync` para validações externas via shell.

**Responsabilidade:** preparar as dependências centrais do agente.

## Bloco 2 — Normalização de mensagens
**Linhas 23–70**
- `normalizeMessages()` corrige mensagens consecutivas do mesmo papel.
- Converte chunks genéricos de chat em `AIMessage`.
- Injeta `HumanMessage` dummy quando o histórico começa com AI.

**Responsabilidade:** compatibilidade e saneamento do histórico para evitar erro de payload no LLM.

## Bloco 3 — Estado do grafo
**Linhas 72–93**
- Define `AgentState` com `messages`, `consecutiveErrors`, `finalAnswer`, `context` e `sender`.

**Responsabilidade:** descrever o estado compartilhado entre os nós do LangGraph.

## Bloco 4 — Classe principal e ciclo de vida
**Linhas 95–137**
- Declara `Agent`.
- Inicializa histórico, prompt base, auditoria, checkpointer SQLite, thread ID e grafo.
- Expõe `loadHistory`, `saveHistory`, `clearHistory` e `cancel()`.

**Responsabilidade:** criar e controlar a instância do agente.

## Bloco 5 — Conversão entre formatos de mensagem
**Linhas 139–169**
- `mapToLangChainMessages()` converte o histórico legado para mensagens LangChain.
- `mapFromLangChainMessages()` reconverte mensagens do grafo para o formato antigo, limpando `<think>`, tool JSON bruto e function tags.

**Responsabilidade:** compatibilidade entre o modelo antigo de histórico e o grafo atual.

## Bloco 6 — Construção do grafo
**Linhas 171–487**
Aqui está a maior concentração de lógica.

### 6.1 Explorer Node
**Linhas 173–228**
- Busca contexto relevante via memória vetorial.
- Monta prompt com ferramentas e regras.
- Faz chamada ao LLM com ferramentas.
- Extrai tool calls manualmente se o modelo responder em texto puro.

**Responsabilidade:** descoberta e recuperação de contexto.

### 6.2 Architect Node
**Linhas 230–255**
- Recebe contexto do explorador.
- Injeta regras de memória permanente.
- Gera um plano técnico passo a passo.

**Responsabilidade:** planejamento.

### 6.3 Coder Node
**Linhas 257–309**
- Recebe o plano do arquiteto.
- Chama o LLM com acesso a tools.
- Faz parser híbrido para tool calls textuais.
- Incrementa erros se a API falhar.

**Responsabilidade:** execução orientada por tools.

### 6.4 QA Node
**Linhas 311–353**
- Só entra se existir `finalAnswer`.
- Pede validação do resultado e testes.
- Pode aprovar ou forçar retrabalho.

**Responsabilidade:** checagem final.

### 6.5 Tool Node
**Linhas 355–424**
- Executa tools chamadas pelo modelo.
- Trata `finish_task` como encerramento.
- Faz autorização via `SecurityManager`.
- Registra auditoria.
- Executa tool e corta saídas grandes.
- Se a tool alterou arquivo, roda `tsc --noEmit` como verificação pós-escrita.
- Aplica “self-healing” quando há erro.

**Responsabilidade:** execução segura das ferramentas e retroalimentação de erro.

### 6.6 Roteamento
**Linhas 426–481**
- Define a transição entre explorer, architect, coder, tools e QA.
- Aplica circuit breaker após 3 erros.

**Responsabilidade:** controlar o fluxo do grafo.

### 6.7 Compilação do workflow
**Linhas 483–487**
- Compila o grafo com checkpointer e interrupção antes do `coderNode` para uso humano.

**Responsabilidade:** ativar o workflow persistente.

## Bloco 7 — Controle de plano e rewind
**Linhas 489–524**
- `abortPlan()` injeta mensagem de cancelamento e encerra.
- `rewindState()` volta para um estado anterior criando nova thread e reaplicando snapshot.

**Responsabilidade:** controle manual do andamento e reversão de contexto.

## Bloco 8 — Execução principal
**Linhas 526–718**
- `runStep()` executa uma rodada do grafo.
- Intercepta slash commands como `/goal` e `/grill-me`.
- Monta estado inicial.
- Streama tokens e eventos de tool para a UI/terminal.
- Faz fallback se nada foi streamado.
- Emite eventos finais, flush de Datadog e salva histórico legado.
- Detecta circuit breaker e trata cancelamento/erro crítico.

**Responsabilidade:** conduzir a execução ponta a ponta e entregar saída ao usuário.

## Onde está a maior complexidade
1. **`buildGraph()`** — concentra quase toda a orquestração.
2. **`toolNode`** — mistura autorização, execução, auditoria, truncamento, verificação de TypeScript e self-healing.
3. **`runStep()`** — mistura streaming, UX, persistência, tokens, cancelamento e fallback.

## Leitura prática
Se o objetivo for simplificar o arquivo, os cortes mais naturais são:
- extrair os nós do grafo para módulos próprios;
- separar configuração de LLM em um helper compartilhado;
- mover segurança/auditoria para uma camada própria;
- reduzir o tamanho de `runStep()`;
- revisar a compatibilidade com o histórico legado.
