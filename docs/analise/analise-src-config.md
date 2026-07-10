# Análise de `src/config.ts`

## Visão geral
`src/config.ts` é o núcleo de configuração do Turbo-Agent. Ele carrega `.agentrc`, aplica defaults, valida variáveis de ambiente e mantém um cache global da configuração.

## Bloco 1 — Schema de configuração
- Define `ConfigSchema` com Zod.
- Os campos incluem limites de execução, auditoria, ferramentas permitidas/bloqueadas, aprovação obrigatória, detecção de segredos, persona, debug, formato de log e Datadog.

**Responsabilidade:** validar a estrutura do arquivo `.agentrc`.

## Bloco 2 — Interface e defaults
- `AgentConfig` representa a configuração final já materializada.
- `DEFAULTS` define o comportamento padrão do sistema.
- O default mais sensível é `maxIterations: 256`, que é alto.
- `requireApprovalFor` já bloqueia várias ações perigosas por padrão.

**Responsabilidade:** estabelecer o comportamento base do agente.

## Bloco 3 — `validateEnv()`
- Exige pelo menos uma chave de API entre OpenAI/Anthropic/Groq/Gemini.
- Se Datadog estiver habilitado, exige chave de Datadog.

**Responsabilidade:** falhar cedo quando faltar dependência crítica do runtime.

## Bloco 4 — `loadConfig()`
- Lê `.agentrc` do diretório atual.
- Faz parse JSON e valida via Zod.
- Mescla `DEFAULTS` com a configuração carregada.
- Chama `validateEnv()`.
- Usa cache global `_config` para evitar recarregar.

**Responsabilidade:** montar a configuração final da sessão.

## Bloco 5 — `getConfig()` e `resetConfig()`
- `getConfig()` retorna a configuração carregada ou carrega sob demanda.
- `resetConfig()` limpa o cache, útil para testes.

**Responsabilidade:** acesso simples e controlado ao estado de configuração.

## Bloco 6 — `createDefaultAgentrc()`
- Cria um `.agentrc` padrão se o arquivo não existir.
- Escreve o JSON com os defaults.

**Responsabilidade:** bootstrap de configuração para novos ambientes.

## Onde está a complexidade
- A configuração define comportamento operacional, segurança, auditoria e integrações externas ao mesmo tempo.
- O arquivo é pequeno, mas extremamente central.
- O cache global `_config` simplifica acesso, mas torna a inicialização e os testes mais sensíveis a ordem de execução.

## Sinais de risco
- `maxIterations: 256` é permissivo demais para um agente autônomo.
- A exigência de API key é ampla, mas a mensagem de erro sugere um sistema multi-provedor que pode ser fácil de configurar errado.
- O `.agentrc` vira uma fonte única de decisões críticas sem separação entre runtime, segurança e observabilidade.
- O cache global pode gerar comportamento inesperado se o processo mudar de diretório ou de contexto.

## Leitura prática
Esse arquivo está bem contido, mas carrega decisões muito importantes. Ele é menos um “helper” e mais a base de governança do agente.

## Resumo em uma frase
`src/config.ts` define e valida o comportamento global do Turbo-Agent, mas também concentra defaults e decisões sensíveis que merecem revisão cuidadosa.
