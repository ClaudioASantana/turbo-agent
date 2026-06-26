# Análise de `src/agent.ts`

## O que ele faz
Ele é o núcleo do projeto. Centraliza:
- estado do agente via **LangGraph**
- memória/histórico
- seleção de LLM
- execução de ferramentas
- segurança/autorização
- auditoria
- fluxo de exploração → arquitetura → execução → QA

## Responsabilidades dentro do arquivo
1. **Normalização de mensagens**
   - `normalizeMessages()` junta mensagens consecutivas e corrige chunks “chat” para `AIMessage`.
   - Isso é uma camada de compatibilidade, mas já é um sinal de complexidade acumulada.

2. **Estado do grafo**
   - `AgentState` guarda `messages`, `consecutiveErrors`, `finalAnswer`, `context`, `sender`.

3. **Inicialização do agente**
   - Carrega histórico, configura checkpointer SQLite, define thread ID e monta o grafo.

4. **Fluxo principal do grafo**
   - `explorerNode`: busca contexto, usa memória vetorial e tenta extrair tool calls.
   - `architectNode`: transforma contexto em plano.
   - `coderNode`: executa o plano e chama ferramentas.
   - `qaNode`: valida o resultado.
   - `toolNode`: executa ferramentas e faz “self-healing”.

5. **Controle operacional**
   - `cancel()`, `abortPlan()`, `rewindState()`, `runStep()`.

## Onde a complexidade está concentrada
- O arquivo mistura:
  - orquestração de workflow
  - política de segurança
  - prompt engineering
  - recuperação de erro
  - execução de ferramentas
  - integração com memória
  - validação final

## Sinais de risco
- Muitas responsabilidades em um único arquivo.
- Há duplicação de configurações de LLM em vários nós.
- O prompt do `coderNode` tem instruções muito agressivas e sobrecarregadas.
- Existem logs de debug espalhados.
- O grafo parece evoluir por camadas, então pode ter legado e branches mortos.
- O `toolNode` inclui checagem de TypeScript pós-escrita, o que mistura execução com validação do build.

## Minha leitura prática
Se eu fosse priorizar simplificação, eu começaria por:
1. separar configuração compartilhada do LLM;
2. extrair os nós do grafo para módulos próprios;
3. isolar segurança/auditoria do fluxo de execução;
4. reduzir o tamanho do `toolNode`;
5. revisar o contrato de mensagens e eventos.

Se quiser, eu posso continuar e fazer um **mapa linha-a-linha das responsabilidades do `src/agent.ts`** ou seguir para **`src/tools.ts`**, que provavelmente é o outro ponto de maior acoplamento.
