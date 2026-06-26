# Análise de `src/index.ts`

## Visão geral
`src/index.ts` é o ponto de entrada do modo CLI do Turbo-Agent. Ele inicializa o LLM, carrega MCP se existir manifesto local, cria a instância do agente e entra em um loop interativo no terminal.

## Bloco 1 — Boot do CLI
- Imprime banner e mensagens iniciais.
- Chama `initLLM()` usando configuração do `.env`.
- Exibe o modelo selecionado.

**Responsabilidade:** preparar a sessão interativa e o cliente LLM.

## Bloco 2 — Inicialização MCP
- Procura um manifesto local com `findLocalManifest()`.
- Se existir, carrega o manifesto e sobe cada servidor MCP com `MCPClientManager`.
- Se não existir, apenas informa que não encontrou manifesto.

**Responsabilidade:** conectar ferramentas externas antes do loop principal.

## Bloco 3 — Instância do agente
- Cria `new Agent()`.
- Chama `agent.loadHistory()`.

**Responsabilidade:** preparar estado e memória da sessão.

## Bloco 4 — Loop interativo
- Lê prompts com `promptUser("Você: ")`.
- Ignora entradas vazias.
- `exit`/`sair` encerram a sessão e fecham MCP.
- `clear`/`limpar` apagam o histórico.

**Responsabilidade:** receber e tratar comandos do usuário.

## Bloco 5 — Comando `/rewind`
- Intercepta `/rewind <n>`.
- Valida o número de passos.
- Chama `agent.rewindState(steps)`.
- Mostra sucesso ou falha.

**Responsabilidade:** permitir retroceder o estado da conversa.

## Bloco 6 — Execução do agente
- Para prompts normais, chama `agent.runStep(prompt)`.
- Se a execução pausar para aprovação, pede confirmação explícita.
- Se o usuário aprovar, retoma com `runStep(null)`.
- Se não aprovar, chama `abortPlan()`.

**Responsabilidade:** orquestrar execução e HITL no terminal.

## Onde está a complexidade
- O arquivo é curto, mas coordena várias responsabilidades:
  - bootstrap do LLM;
  - bootstrap MCP;
  - ciclo interativo;
  - controle de histórico;
  - rewind;
  - aprovação humana.

## Sinais de risco
- `index.ts` depende bastante de efeitos colaterais globais do `Agent` e do MCP manager.
- O CLI trata comandos especiais inline, o que pode crescer com novas funcionalidades.
- A lógica de aprovação está acoplada ao retorno de `runStep()`.

## Leitura prática
É um arquivo de entrada bem enxuto e razoavelmente saudável. A maior parte da complexidade real está no `Agent`; aqui o foco é coordenação.

## Resumo em uma frase
`src/index.ts` é o controlador do modo CLI: simples na superfície, mas amarrado ao bootstrap do agente, MCP e ao fluxo de aprovação humana.
