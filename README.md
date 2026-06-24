# 🚀 Turbo-Agent

**O Agente Autônomo de IA Local definitivo.**

O Turbo-Agent é uma ferramenta CLI construída para atuar como um agente autônomo inteligente diretamente no seu ambiente local. Integrado com poderosos Modelos de Linguagem (LLMs) via proxy ou instâncias locais (Ollama, LM Studio), ele gerencia contexto, memórias, e executa ferramentas no sistema operacional de forma segura e autônoma, atuando como o seu melhor par na hora de programar, investigar bugs ou gerenciar a infraestrutura.

---

## ✨ Principais Funcionalidades e Melhorias

Nosso projeto evoluiu de um simples script interativo para uma arquitetura robusta de nível corporativo (*Enterprise*). Aqui estão as principais inovações incorporadas:

### 🧠 Core & Inteligência
- **Arquitetura baseada em LangGraph**: Transição para grafos de estado robustos, trazendo funcionalidades corporativas como:
  - **Human-in-the-Loop (HITL)**: Interrupções de segurança solicitando aprovação humana explícita antes de ações perigosas (como modificar arquivos e rodar comandos destrutivos).
  - **Agentic RAG & Map-Reduce**: Capacidade nativa de processamento paralelo e recuperação de contexto, ideal para bases de código extensas.
- **Parser Híbrido e Auto-Recuperação (Resilience)**: Extração flexível de chamadas de ferramentas. Se o LLM truncar a resposta ou gerar um JSON malformado, o agente entra em modo de auto-recuperação de até 3 tentativas.
- **Circuit Breaker Anti-Alucinação**: Monitoramento constante de execuções. Em caso de múltiplas falhas seguidas ao chamar uma ferramenta, o *Circuit Breaker* desarma e interrompe o agente, prevenindo o temido *Death Loop* e o consumo infinito de tokens computacionais.
- **Memória Estruturada com SQLite**: Gerenciamento do histórico de conversas (*Memory Saver*) garantindo a linearidade, restaurando estados com precisão e evitando corrupções no objeto do *LangChain* (como perda de *Roles*).

### 🔌 Model Context Protocol (MCP) e Ferramentas
- **Integração MCP Nativa**: Conecta-se a servidores MCP (via protocolo de streams padrão Stdio) para expandir infinitamente o rol de ferramentas.
- **Limpeza Profunda de Schemas (Deep Clean)**: Sanitização recursiva em esquemas JSON complexos de ferramentas de terceiros. Isso remove propriedades estritas incompatíveis (como `additionalProperties` e `default`), garantindo payloads imaculados que evitam erros `400 Bad Request` das APIs da OpenAI e de outros provedores.
- **ToolRegistry Orientado a Objetos**: Cada ferramenta é modular e registrada com validação estrita via `Zod` e `zod-to-json-schema`.

### 🛡️ Segurança & Execução de Sistema
- **Terminal PTY Persistente**: Implementado com `node-pty`, o agente cria e mantém sessões reais de terminal. Variáveis de ambiente e mudanças de diretório (`cd`) sobrevivem entre uma chamada e outra do agente.
- **Controle de Permissões (RBAC)**: Regras e níveis lógicos de permissão de atuação (*safe*, *moderate*, *dangerous*), solicitando o usuário sob demanda.
- **Detecção de Segredos Ativa**: Analisa e bloqueia proativamente o vazamento acidental de segredos — como chaves AWS, tokens do GitHub, senhas, chaves da OpenAI, chaves do Discord/Slack e JWTs — mantendo seus logs seguros.
- **Context Awareness Dinâmico**: O agente sempre sabe o estado local! Seu prompt dinâmico injeta Sistema Operacional, Diretório Atual (CWD), Horário Local, Branch atual do Git e Status dos arquivos (modificados/untracked).

### 🛠️ Usabilidade
- **CLI Global**: O projeto foi empacotado para atuar como uma ferramenta global na máquina (um `turbo-agent` executável a partir de qualquer pasta).
- **Interface TUI Fluida**: Usabilidade moderna de linha de comando suportada por `@inquirer/prompts` e `picocolors` para interações coloridas, spinners de progresso (`ora`) e confirmações *clean*.
- **Auditoria de Ações**: Todos os logs operacionais são gravados em formato `.jsonl`, permitindo auditoria futura sobre aprovações, execuções de comandos e recusas.

---

## 🤖 Orquestração RAG Multiagente em Produção

O Turbo-Agent não é apenas um script linear; ele foi desenhado com uma arquitetura avançada de **RAG (Retrieval-Augmented Generation) Multiagente** para atuar com alta disponibilidade, controle de custo e resiliência em bases extensas. 

Em vez de enviar a pergunta diretamente para o modelo (o que gera alto custo e alucinações), o agente divide a tarefa em especialistas:
- **Router Agent**: Decide o fluxo. Uma pergunta simples vai para um modelo mais barato; uma dúvida arquitetural complexa aciona a busca profunda no Vector DB (Busca Híbrida).
- **Retrieval & Context Builder**: Compacta, re-rankeia e aplica limite de tokens aos documentos antes de montar o *System Prompt* final, garantindo um limite seguro de janela de contexto.
- **Evaluator & Guardrail Agents**: Avaliam a veracidade das respostas, filtram vazamento de dados sensíveis e previnem ataques de *prompt injection* na raiz.
- **Model Gateway & Fallback**: Se o provedor principal de LLM falhar ou der _timeout_, o sistema automaticamente engatilha uma degradação graciosa para provedores alternativos (ex: fallback de GPT-4 para Llama local), com _retry_ e _backoff_.

---

## 🏗️ Resumo da Arquitetura

A estrutura interna foi desenvolvida focada em modularidade e robustez para LLMs de alto desempenho (como família Qwen e modelos de Reasoning avançado):

- **`Agent` (Classe Principal)**: Orquestra todo o System Prompt, as memórias compactadas (quando ultrapassam o threshold configurado) e lida com o parse de ferramentas retirando com eficiência qualquer *thought* chain (tag `<think>`).
- **Personas Pluggáveis**: Transição rápida do agente para comportamentos orientados: *reviewer*, *qa*, *researcher* e *generic*.
- **Interceptador de Roles LangGraph**: Uma camada robusta de serialização que resgata `ChatMessageChunk` e os castiga com sucesso de volta para `AIMessage`, curando bugs clássicos do *memory state* do LangGraph.

*(Documentação atualizada em conformidade com as recentes refatorações de arquitetura e correções de incidentes - Junho/2026).*
