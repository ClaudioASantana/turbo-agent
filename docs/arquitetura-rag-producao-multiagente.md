# Arquitetura RAG em Produção com Múltiplos Agentes

> Documento gerado a partir da conversa sobre como arquitetar um sistema RAG robusto em produção,
> com controle de custo por token e fallback quando o modelo principal cai.

---

## Visão Geral

```text
                ┌────────────────────┐
                │      Usuário        │
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │ API Gateway / BFF   │
                └─────────┬──────────┘
                          │
                          ▼
                ┌────────────────────┐
                │ Orquestrador RAG    │
                │ Multiagente         │
                └─────┬─────┬────────┘
                      │     │
        ┌─────────────┘     └─────────────┐
        ▼                                 ▼
┌────────────────┐              ┌────────────────┐
│ Agente Router  │              │ Agente Guardrail│
└────────────────┘              └────────────────┘
        │                                 │
        ▼                                 ▼
┌────────────────┐              ┌────────────────┐
│ Agente Retrieval│             │ Agente Avaliação│
└───────┬────────┘              └────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ Vector DB / Hybrid Search    │
│ BM25 + Embeddings + Rerank   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Modelo principal / fallback  │
└──────────────────────────────┘
```

---

## 1. API Gateway / BFF

Essa camada recebe as requisições dos usuários ou aplicações clientes.

**Responsabilidades:**

- autenticação;
- rate limiting;
- validação de payload;
- identificação do tenant/cliente;
- controle de quotas;
- tracing da requisição;
- roteamento para o orquestrador.

**Políticas aplicadas aqui:**

- limite máximo de tokens por request;
- limite diário/mensal por usuário;
- plano contratado;
- priorização de tráfego.

---

## 2. Orquestrador Multiagente

O coração do sistema. Coordena agentes especializados em vez de chamar o LLM diretamente.

### Agente 1: Router Agent

Decide qual fluxo seguir.

Exemplos de decisão:

- pergunta simples → sem RAG;
- pergunta documental → RAG;
- pergunta de cálculo → ferramenta;
- pergunta sensível → validação;
- pergunta proibida → recusa;
- pergunta que precisa de API externa → integração.

Pode usar:

- regras determinísticas;
- classificador pequeno;
- modelo barato;
- embeddings;
- árvore de decisão;
- LLM menor.

> O ideal é não usar o modelo mais caro só para decidir roteamento.

---

### Agente 2: Retrieval Agent

Responsável por buscar contexto.

**Pipeline típico:**

```text
query do usuário
   ↓
normalização
   ↓
expansão ou reescrita da query
   ↓
busca híbrida: vector + BM25
   ↓
filtro por permissões/tenant
   ↓
reranker
   ↓
seleção dos top-k chunks
   ↓
compressão/sumarização contextual
```

---

### Agente 3: Context Builder

Monta o prompt final.

**Responsabilidades:**

- ordenar documentos por relevância;
- eliminar duplicatas;
- cortar trechos irrelevantes;
- respeitar limite de tokens;
- incluir citações/fontes;
- montar instruções do sistema;
- preservar histórico de conversa quando necessário.

> Esse agente é importante para controle de custo, porque ele decide quanto contexto vai para o modelo.

---

### Agente 4: Answer Agent

Responsável por gerar a resposta final usando o modelo principal.

Modelos possíveis:

- GPT-4.1;
- Claude Sonnet;
- Gemini Pro;
- Llama hospedado internamente;
- outro modelo premium.

> Não deve ser chamado sem antes passar por políticas de custo, disponibilidade e segurança.

---

### Agente 5: Evaluator / Critic Agent

Avalia a resposta antes de devolver ao usuário.

Verifica:

- se respondeu à pergunta;
- se usou as fontes corretamente;
- se inventou informação;
- se citou documentos inexistentes;
- se violou política;
- se a confiança é baixa;
- se precisa refazer a busca.

> Pode ser um modelo menor ou regras especializadas.

---

### Agente 6: Guardrail Agent

Faz controle de segurança.

**Responsabilidades:**

- prevenção de prompt injection;
- validação de PII;
- bloqueio de dados sensíveis;
- checagem de políticas internas;
- moderação de conteúdo;
- proteção contra vazamento de contexto.

Atua em três momentos:

- antes da recuperação;
- antes da geração;
- depois da resposta.

---

## 3. Ingestão de Dados

A ingestão deve ser assíncrona e robusta.

**Pipeline:**

```text
Fontes de dados
   ↓
Conectores
   ↓
Extração
   ↓
Limpeza
   ↓
Chunking
   ↓
Geração de embeddings
   ↓
Indexação vetorial + lexical
   ↓
Versionamento
```

**Fontes possíveis:**

- PDFs;
- Notion;
- Confluence;
- Google Drive;
- SharePoint;
- banco relacional;
- tickets;
- CRM;
- documentação técnica;
- páginas web;
- APIs internas.

**Filas recomendadas:**

- SQS;
- RabbitMQ;
- Kafka;
- Pub/Sub;
- Celery;
- BullMQ.

---

## 4. Estratégia de Chunking

Chunking mal feito destrói um RAG.

### Para documentação textual

- chunks entre 300 e 800 tokens;
- overlap de 10% a 20%;
- preservação de títulos e subtítulos;
- metadata com caminho, seção, autor, data, permissões.

### Para tabelas

- chunk estruturado;
- preservação de cabeçalhos;
- possível conversão para texto explicativo.

### Para código

- chunk por função/classe;
- metadata com arquivo, linguagem, módulo;
- árvore sintática quando possível.

### Para documentos legais ou contratos

- chunk por cláusula;
- preservação de hierarquia;
- alta rastreabilidade da fonte.

---

## 5. Vector DB e Busca Híbrida

Não depender apenas de vector search.

**Fórmula de score híbrido:**

```text
score_final = α * score_vetorial + β * score_bm25 + γ * score_recency + δ * score_permissão
```

**Ferramentas possíveis:**

- Pinecone;
- Weaviate;
- Qdrant;
- Milvus;
- Elasticsearch/OpenSearch;
- pgvector;
- Vespa.

**Para produção séria:**

- filtros por tenant;
- filtros por ACL;
- namespace por cliente;
- versionamento de índice;
- rollback de índice;
- reindexação assíncrona;
- métricas de recall.

---

## 6. Controle de Custo por Token

### Token Budget Manager

Fica entre o orquestrador e os modelos.

**Responsabilidades:**

- estimar tokens antes da chamada;
- calcular custo previsto;
- validar orçamento do usuário/tenant;
- escolher modelo com base no custo;
- limitar tamanho do contexto;
- registrar custo real após resposta;
- bloquear ou degradar chamadas muito caras.

**Fluxo:**

```text
Request entra
   ↓
estima tokens de entrada
   ↓
define modelo candidato
   ↓
estima custo
   ↓
verifica orçamento
   ↓
aprova, reduz contexto ou troca modelo
```

---

## 7. Políticas de Custo

### Por usuário

- limite diário;
- limite mensal;
- limite por requisição;
- limite por minuto.

### Por tenant

- orçamento mensal;
- limite de tokens acumulados;
- limite por tipo de modelo.

### Por endpoint

- perguntas simples usam modelo barato;
- geração complexa usa modelo premium;
- avaliação usa modelo pequeno.

### Por criticidade

- tarefas internas de baixa criticidade podem degradar;
- clientes premium podem usar fallback premium;
- usuários gratuitos podem usar modelos menores.

---

## 8. Estratégias Práticas para Reduzir Custo

### 1. Query Routing

Nem toda pergunta precisa de RAG ou modelo grande.

- saudação → resposta template;
- pergunta de status → API;
- pergunta simples → modelo pequeno;
- pergunta técnica complexa → RAG + modelo maior.

### 2. Context Compression

Antes de mandar 20 chunks para o modelo, comprimir para os mais relevantes.

Técnicas:

- reranking;
- sumarização;
- MMR;
- remoção de duplicatas;
- seleção adaptativa de top-k;
- contextual compression.

### 3. Cache Semântico

```text
Pergunta nova
   ↓
gera embedding
   ↓
procura pergunta similar no cache
   ↓
se similaridade > 0.92, retorna resposta cacheada
```

Tipos de cache:

- cache exato por hash;
- cache semântico por embedding;
- cache por documento;
- cache de chunks recuperados;
- cache de respostas validadas.

### 4. Model Tiering

```text
Tier 1: modelo barato para roteamento
Tier 2: modelo médio para respostas simples
Tier 3: modelo premium para tarefas difíceis
Tier 4: modelo fallback/local para emergência
```

### 5. Limite Dinâmico de Contexto

```text
Se confiança da busca for alta:
  usar 3 chunks

Se confiança for média:
  usar 6 chunks

Se confiança for baixa:
  reformular query ou pedir esclarecimento
```

---

## 9. Fallback quando o Modelo Principal Cai

### Camada 1: Retry Controlado

- retry com exponential backoff;
- jitter;
- limite pequeno de tentativas;
- timeout agressivo.

```text
tentativa 1: modelo principal
falhou timeout
aguarda 300ms
tentativa 2
falhou 5xx
aciona fallback
```

### Camada 2: Circuit Breaker

Estados:

```text
CLOSED    → usa modelo principal normalmente
OPEN      → não chama modelo principal, usa fallback direto
HALF_OPEN → testa chamadas gradualmente
```

### Camada 3: Fallback entre Provedores

```text
Principal: GPT-4.1
Fallback 1: Claude Sonnet
Fallback 2: Gemini Pro
Fallback 3: Llama 3.1 hospedado internamente
Fallback 4: resposta degradada baseada apenas em busca
```

O roteador de modelos deve conhecer:

- custo;
- latência;
- disponibilidade;
- qualidade;
- janela de contexto;
- suporte a ferramentas;
- região;
- compliance.

### Camada 4: Degradação Graciosa

Se nenhum modelo premium estiver disponível:

- usar modelo menor;
- reduzir contexto;
- retornar resposta parcial;
- retornar documentos mais relevantes;
- pedir para tentar novamente;
- abrir ticket assíncrono;
- usar resposta cacheada.

**Exemplo de resposta degradada:**

> "No momento, o mecanismo de geração avançada está indisponível. Encontrei estes documentos potencialmente relevantes: ..."

---

## 10. Model Gateway

Todos os modelos ficam atrás de um **Model Gateway** interno.

Abstrai provedores como:

- OpenAI;
- Anthropic;
- Google;
- Azure OpenAI;
- AWS Bedrock;
- modelos locais.

**Interface exemplo:**

```ts
modelGateway.generate({
  task: "answer_generation",
  priority: "high",
  maxCostUsd: 0.05,
  preferredModel: "gpt-4.1",
  fallbackModels: ["claude-3-5-sonnet", "gemini-1.5-pro", "llama-local"],
  input,
});
```

**O gateway cuida de:**

- retries;
- fallback;
- logging;
- medição de tokens;
- seleção de modelo;
- circuit breaker;
- rate limits;
- normalização de resposta.

---

## 11. Observabilidade

### Métricas de produto

- perguntas respondidas;
- taxa de satisfação;
- taxa de fallback;
- taxa de "não sei";
- tempo médio de resposta.

### Métricas de RAG

- recall@k;
- precision@k;
- MRR;
- relevância dos chunks;
- taxa de resposta sem fonte;
- taxa de alucinação detectada.

### Métricas de custo

- tokens por usuário;
- tokens por tenant;
- custo por request;
- custo por modelo;
- custo por tipo de tarefa;
- custo por documento consultado.

### Métricas de infraestrutura

- latência p50/p95/p99;
- erros por provedor;
- timeouts;
- filas;
- throughput;
- uso do vector DB.

**Ferramentas possíveis:**

- OpenTelemetry;
- Prometheus;
- Grafana;
- Datadog;
- Langfuse;
- Helicone;
- Arize Phoenix;
- Elastic;
- CloudWatch.

---

## 12. Auditoria e Rastreabilidade

Cada resposta deve ter um registro com:

```json
{
  "request_id": "abc",
  "user_id": "u123",
  "tenant_id": "t456",
  "query": "...",
  "retrieved_documents": ["doc1", "doc2"],
  "model_used": "gpt-4.1",
  "fallback_used": false,
  "input_tokens": 3200,
  "output_tokens": 700,
  "estimated_cost": 0.043,
  "actual_cost": 0.041,
  "latency_ms": 4300,
  "confidence_score": 0.82
}
```

Essencial para:

- debugging;
- billing;
- compliance;
- melhoria contínua;
- análise de qualidade.

---

## 13. Segurança e Permissões

O modelo não pode recuperar documentos que o usuário não tem permissão para ver.

**Regras:**

- aplicar ACL antes da recuperação ou no filtro da busca;
- usar tenant isolation;
- criptografar dados sensíveis;
- mascarar PII;
- nunca confiar apenas no prompt;
- validar fontes;
- proteger contra prompt injection vindo dos documentos.

**Exemplo:**

```text
Usuário A pergunta sobre folha salarial
   ↓
retrieval só considera documentos que Usuário A pode acessar
   ↓
modelo nunca recebe chunks proibidos
```

---

## 14. Fluxo Completo de uma Requisição

```text
1.  Usuário envia pergunta
2.  API autentica e identifica tenant
3.  Guardrail analisa entrada
4.  Router decide se precisa de RAG
5.  Budget Manager estima custo
6.  Retrieval Agent busca documentos
7.  Reranker ordena resultados
8.  Context Builder monta contexto
9.  Budget Manager ajusta tokens finais
10. Model Gateway chama modelo principal
11. Se falhar, aciona retry/fallback/circuit breaker
12. Evaluator verifica qualidade
13. Se necessário, refaz busca ou pede esclarecimento
14. Resposta é retornada com fontes
15. Logs, custos e métricas são gravados
```

---

## 15. Exemplo de Decisão de Modelo

```text
Se pergunta é simples:
  usar modelo barato

Se pergunta precisa de documentos:
  usar RAG + modelo médio

Se pergunta é crítica ou complexa:
  usar RAG + modelo premium

Se custo estimado excede orçamento:
  reduzir contexto ou usar modelo menor

Se modelo principal indisponível:
  usar fallback configurado

Se confiança da recuperação é baixa:
  pedir esclarecimento ou responder com baixa confiança
```

---

## 16. Stack Possível

### Backend

- Python com FastAPI ou Node.js com NestJS;
- workers com Celery, BullMQ ou Temporal;
- filas com RabbitMQ, Kafka ou SQS.

### RAG

- LangChain, LlamaIndex ou implementação própria;
- Qdrant, Weaviate, Pinecone, pgvector ou OpenSearch;
- reranker como Cohere Rerank, bge-reranker ou Jina.

### Model Gateway

- OpenAI;
- Anthropic;
- Gemini;
- Bedrock;
- Azure OpenAI;
- modelo local via vLLM/Ollama/TGI.

### Observabilidade

- OpenTelemetry;
- Prometheus/Grafana;
- Langfuse ou Helicone.

### Dados

- Postgres para metadados;
- Redis para cache;
- object storage para documentos;
- vector DB para embeddings.

---

## 17. Princípio Central

Evitar criar um "RAG monolítico" onde tudo acontece em uma única chamada ao LLM.

```text
RAG = Retrieval + Orchestration + Policy + Generation + Evaluation + Observability
```

O LLM é apenas um componente. O sistema de produção precisa controlar:

- custo;
- latência;
- segurança;
- disponibilidade;
- qualidade;
- fallback;
- auditoria;
- permissões.

---

## Resumo Executivo

| Componente | Responsabilidade |
|---|---|
| **API Gateway** | Autenticação, rate limit, quotas |
| **Orquestrador multiagente** | Coordena roteamento, retrieval, geração e avaliação |
| **Busca híbrida** | Vector search + BM25 + reranking |
| **Token Budget Manager** | Estima e controla custo por usuário, tenant e request |
| **Model Gateway** | Abstrai modelos, aplica fallback, retry e circuit breaker |
| **Cache semântico** | Reduz chamadas repetidas |
| **Guardrails** | Segurança, permissões e prompt injection |
| **Observabilidade** | Mede qualidade, custo, latência e falhas |
| **Fallback em camadas** | Mantém o sistema funcionando mesmo quando o modelo principal cair |
