# Relatório de Correções Críticas (Turbo-Agent)

## O Problema Principal: `400 Bad request to upstream provider`

Durante os testes de chamadas à API da OpenAI via um proxy customizado, ocorria repetidamente o erro `400 Bad Request`. Foram identificadas duas causas raízes distintas trabalhando juntas para quebrar a comunicação com o provedor:

### 1. Esquemas de Ferramentas Inválidos (MCP Tools)
A API do Langchain/OpenAI possui uma validação JSON Schema extremamente rígida e não permite chaves extras como `$schema`, `additionalProperties` e, principalmente, `default` nos esquemas de chamadas de ferramentas (Function Calling).
- **Causa:** O Turbo-Agent importa ferramentas locais e ferramentas de servidores MCP dinâmicos (como o `test-server`). As ferramentas provindas de servidores MCP vinham poluídas com as propriedades estritas (`default`, `additionalProperties`).
- **Resolução:** A função `getSchemas()` em `src/tools.ts` foi completamente reescrita com um "Deep Clean" (Limpeza Profunda). Antes de enviar qualquer ferramenta do ToolRegistry para o LLM, o código agora percorre recursivamente todo o objeto de propriedades e deleta as chaves proibidas, normalizando o formato para o padrão oficial suportado pela OpenAI.

### 2. Histórico Corrompido (`ChatMessageChunk` sem Role)
Quando o modelo respondia por stream e o proxy não definia explicitamente a `role: "assistant"`, o Langchain armazenava a resposta no estado do LangGraph utilizando a classe genérica `ChatMessageChunk`.
- **Causa:** Quando a próxima iteração acontecia, o LangGraph enviava todo o histórico salvo (`.langgraph_memory.db`) de volta ao proxy. O `ChatMessageChunk` retornava `role: undefined`, falhando na validação com `Unknown message role: undefined` e causando o erro `400`.
- **Resolução:** Na função auxiliar `normalizeMessages` em `src/agent.ts`, foi injetada uma camada interceptadora de sanitização. Sempre que uma mensagem no histórico for do tipo `"chat"`, `"chat_chunk"`, `"generic"` ou seu construtor contiver `"ChatMessage"`, o sistema a converte ativamente e à força em um `AIMessage` oficial com todos os metadados preservados.

---

> [!NOTE]  
> Todos os problemas relacionados à estrutura do payload LLM e injeção do schema MCP foram mitigados na ramificação atual. O agente pode agora transicionar livremente pelos nodes (Explorador -> Arquiteto -> Coder) sem gargalos de comunicação do proxy.
