# Análise de `src/index.ts`

> Atualizado em: 26/06/2026 — Baseado na leitura direta do código-fonte atual.

## Visão geral

`src/index.ts` é o ponto de entrada do modo CLI do Turbo-Agent. Ele inicializa o LLM, carrega o manifesto MCP (se houver), cria a instância do agente e entra em um loop interativo no terminal.

## Responsabilidades

### 1. Boot do CLI
- Imprime banner e mensagens iniciais.
- Inicializa o LLM via `initLLM()` (usa variáveis de ambiente).
- Exibe o modelo selecionado.

### 2. Inicialização do MCP
- Procura manifesto local (`mcp.json`).
 Se existir, carrega o manifesto e inicia cada servidor MCP via `MCPClientManager`.
 Caso contrário, apenas informa que não encontrou manifesto.

### 3. Instância do agente
- Cria `new Agent()`.
- Carrega o histórico salvo (`.agent_history.json`).

### 4. Loop interativo
- Lê prompt com `promptUser("Você: ")`.
- Ignora entradas vazias.
- Comandos `exit`/`sair` encerram sessão e fecham conexões MCP.
- `clear`/`limpar` apagam o histórico salvo.

### 5. Comando `/rewind`
- Intercepta entradas que começam com `/rewind <n>`.
- Valida o número de passos (deve ser inteiro positivo).
- Chama `agent.rewindState(steps)` para retroceder estado.
- Mostra mensagem de sucesso ou falha.

### 6. Execução do agente
- Para prompts normais, chama `agent.runStep(prompt)`.
- Se o resultado indicar pausa (`status: 'paused'`), solicita confirmação explícita do usuário.
- Se o usuário aprovar, retoma com `agent.runStep(null)`.
- Se o usuário negar, chama `agent.abortPlan()`.

## Onde está a complexidade

O arquivo é pequeno, mas coordena várias responsabilidades:
- bootstrap do LLM (`initLLM()`);
- bootstrap do MCP (`MCPClientManager`);
- loop interativo com `promptUser`;
- controle de histórico (`loadHistory`, `clearHistory`);
- comando `/rewind`;
- lógica de aprovação humana (HITL) baseada no retorno de `runStep()`.

## Sinais de risco

- `index.ts` depende de efeitos colaterais globais do objeto `Agent` e do `MCPClientManager`.
- O CLI trata comandos especiais inline (`/rewind`, `exit`, `clear`), o que pode crescer com novas funcionalidades.
- A lógica de aprovação humana está acoplada ao retorno de `runStep()` (verificação de `status === 'paused'`).

## Leitura prática

É um arquivo de entrada enxuto e razoavelmente saudável. A maior parte da complexidade real está no `Agent`; aqui o foco é apenas coordenação de inicialização e loop.

## Resumo em uma frase

`src/index.ts` é o controlador do modo CLI: simples na superfície, mas amarrado ao bootstrap do agente, MCP e ao fluxo de aprovação humana.
