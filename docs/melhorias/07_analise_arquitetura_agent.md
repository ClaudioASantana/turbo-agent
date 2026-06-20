# Analise Completa da Arquitetura - Turbo Agent

> Atualizado em: 6/19/2026 - Branch: fix-login-security
> Todos os arquivos src/ analisados e documentados.

---

## src/agent.ts - Classe Principal

### Propriedades

| Propriedade | Tipo | Padrao | Descricao |
|---|---|---|---|
| globalMessages | any[] | [] | Historico de mensagens do LLM |
| historyFile | string | .agent_history.json | Caminho absoluto do historico |
| maxIterations | number | 256 | Limite de loops do agente |
| maxMessages | number | 20 | Threshold para auto-sumarizacao |
| isSubagent | boolean | false | Flag de subagente |
| consecutiveErrors | number | 0 | Contador para Circuit Breaker |
| persona | string | generic | Persona especializada |

### Personas

| Persona | Foco |
|---|---|
| reviewer | Revisao de codigo e seguranca |
| qa | Testes e qualidade |
| researcher | Pesquisa e documentacao |
| generic | Uso geral (padrao) |


### Fluxo principal do Agent

O metodo runStep executa o ciclo principal:

1. Monta/atualiza o system prompt.
2. Envia mensagens ao LLM.
3. Remove blocos de raciocinio e extrai chamadas de ferramenta.
4. Valida permissoes, segredos e necessidade de aprovacao.
5. Executa ferramentas via ToolRegistry.
6. Registra auditoria e persiste historico.
7. Aplica compactacao quando o historico excede maxMessages.

### Prompt dinamico

O prompt do sistema injeta duas partes variaveis:

- DYNAMIC_CONTEXT: SO, CWD, data local, branch Git e git status.
- TOOL_SCHEMAS: schemas das ferramentas registradas.


## src/index.ts - Entrada da aplicacao

Arquivo responsavel por inicializar o agente e o loop interativo.

Principais responsabilidades:

- Carregar variaveis de ambiente.
- Oferecer menu de selecao de modelo.
- Inicializar o cliente LLM com initLLM().
- Inicializar ferramentas MCP quando disponiveis.
- Criar instancia de Agent.
- Manter loop de prompt do usuario ate encerramento.

Modelos observados:

- Modelo definido por variavel de ambiente.
- omniagent/Qwen 3.6 35B.
- qwen2.5-coder:14b.
- qwq.


## src/tools.ts - Registro e execucao de ferramentas

Centraliza o ToolRegistry e as implementacoes das ferramentas locais.

Componentes importantes:

- ToolRegistry: registra schemas e handlers.
- backgroundProcesses: mapa de processos iniciados em background.
- resolveFilePath(): resolve caminhos diretos ou busca recursiva.
- searchFilesHelper(): busca texto em arquivos ignorando node_modules e .git.
- extractSignatures(): extrai assinaturas/estrutura de codigo.

Ferramentas perigosas como escrita de arquivo, comandos shell e patches devem passar pelo fluxo de permissao/aprovacao quando configurado.


## src/llmClient.ts - Cliente HTTP para o LLM

- Exporta instancia openai (OpenAI SDK).
- Funcao initLLM() aceita baseURL e apiKey opcionais.
- Padrao: baseURL = http://172.24.160.1:18080/v1, apiKey = llama.cpp.
- Suporta override por variaveis de ambiente: LLM_BASE_URL, LLM_API_KEY, OPENROUTER_API_KEY.

---

## src/context.ts - Contexto dinamico

- Funcao getDynamicContext() gera string com:
  - Sistema operacional.
  - CWD.
  - Data/hora local.
  - Branch git.
  - Saida de git status -s.
- Falha silenciosa em diretorios que nao sao repositorios git.

---

## src/memory.ts - Compactacao do historico

- Funcao summarizeMessages(messages) chamada automaticamente por Agent.
- Envia historico antigo ao LLM para compactacao.
- Modelo: qwen-35b-turboquant, temperature: 0.1.
- Preserva arquivos, caminhos, comandos e decisoes no resumo.


## src/parser.ts - Parser de respostas do LLM

- Funcao extractToolCalls(response) retorna lista de chamadas de ferramenta.
- Remove blocos de raciocinio antes do parse.
- Tenta tres estrategias em ordem:
  1. JSON direto no response.
  2. Bloco de codigo JSON delimitado por acentos graves.
  3. Regex para extrair objeto JSON no texto.
- Retorna array vazio se nenhuma estrategia funcionar.

---

## src/promptUser.ts - Interacao com usuario

- promptUser(): le linha de texto via terminal.
- confirmAction(defaultAnswer=false): exibe confirmacao Y/N.
- Dependencias: @inquirer/prompts, picocolors.

---

## src/terminal.ts - Terminal PTY persistente

- Classe PersistentTerminal baseada em node-pty.
- Estado persiste entre chamadas (variavel de ambiente, cd, etc).
- Marcador de fim de comando via hash aleatorio.
- Metodo execute(cmd, timeout) executa comando e retorna output limpo.
- Metodo cleanOutput() remove escape codes ANSI.


## src/config.ts - Configuracao do agente

- Interface AgentConfig define todas as opcoes.
- Arquivo de configuracao: .agentrc (JSON no CWD).
- Padrao singleton via getConfig().
- Funcao createDefaultAgentrc() cria arquivo inicial.

Ferramentas que exigem aprovacao por padrao:

- write_file
- run_command
- patch_file
- replace_in_file
- start_background_command
- create_pull_request

---

## src/audit.ts - Log de auditoria

Eventos suportados (AuditEventType):

- TOOL_CALL, TOOL_RESULT, TOOL_ERROR
- PERMISSION_DENIED, APPROVAL_REQUESTED, APPROVAL_GRANTED, APPROVAL_DENIED
- SECRET_DETECTED, AGENT_START

Funcoes:

- logAuditEvent(): grava evento em JSONL.
- sanitizeArgs(): redacta campos sensiveis (password, secret, token, key, auth, credential, api_key).
- auditToolResult(): registra resultado truncado a 500 chars.


## src/permissions.ts - Controle de permissoes

Niveis de permissao (PermissionLevel):

- safe: leitura, sem efeito colateral.
- moderate: efeito colateral limitado.
- dangerous: efeito colateral significativo.

Funcao checkPermission() aplica as regras em ordem:

1. Verifica o nivel da ferramenta no mapa TOOL_PERMISSIONS.
2. Verifica se a ferramenta esta na lista requireApprovalFor da config.
3. Solicita confirmacao interativa se necessario.

Ferramentas desconhecidas recebem nivel dangerous e requiresApproval=true automaticamente.

---

## src/secretsDetector.ts - Deteccao de segredos

13 padroes detectados:

- AWS Access Key e Secret Key.
- GitHub Personal Access Token.
- OpenAI e Anthropic API Keys.
- Slack Token e Webhook URL.
- Discord Token e Webhook URL.
- SendGrid API Key.
- Twilio Account SID e Auth Token.
- Chaves hexadecimais longas genericas.
- JWT tokens.

Funcoes exportadas:

- detectSecrets(text): retorna array de segredos encontrados.
- hasSecrets(text): retorna boolean.
- formatSecretsWarning(): formata aviso em PT-BR.


---

## Diagrama de dependencias

```
src/index.ts
  └── src/agent.ts
        ├── src/context.ts         (getDynamicContext)
        ├── src/memory.ts          (summarizeMessages)
        ├── src/llmClient.ts       (openai, initLLM)
        ├── src/parser.ts          (extractToolCalls)
        ├── src/secretsDetector.ts (hasSecrets, formatSecretsWarning)
        ├── src/permissions.ts     (checkPermission)
        ├── src/config.ts          (getConfig, requireApprovalFor)
        ├── src/promptUser.ts      (confirmAction)
        ├── src/audit.ts           (logAuditEvent, sanitizeArgs)
        └── src/tools.ts
              ├── ToolRegistry (register/execute/getSchemas)
              ├── src/terminal.ts  (PersistentTerminal)
              └── src/promptUser.ts
```

---

## Dependencias externas

| Pacote              | Uso principal                              |
|---------------------|--------------------------------------------|
| openai              | Cliente HTTP OpenAI-compatible             |
| node-pty            | Terminal PTY persistente                   |
| @inquirer/prompts   | Confirmacoes interativas no terminal       |
| picocolors          | Coloracao de output no terminal            |
| ora                 | Spinner de progresso                       |
| dotenv              | Carregamento de variaveis de ambiente      |
| cheerio             | Parsing de HTML em fetch_url               |
| zod / zod-to-json-schema | Validacao e geracao de schemas JSON   |

---

## Pontos de atencao e oportunidades de melhoria

1. **Loop de subagentes**: arquivos .agent_history_sub_*.json acumulam no CWD. Mover para diretorio temporario.
2. **resolveFilePath()**: busca recursiva pode ser lenta em repos grandes. Adicionar limite de profundidade.
3. **secretsDetector**: padrao de hex longo pode gerar falsos positivos (hashes git, UUIDs, etc).
4. **memory.ts**: o resumo vai para o inicio do historico mas substitui todas as mensagens antigas de uma vez; considerar janela deslizante.
5. **PersistentTerminal**: timeout padrao de 30s pode ser curto para compilacoes ou installs demorados.
6. **config.ts**: nao ha validacao de schema no .agentrc; um arquivo corrompido pode causar falha silenciosa.
7. **audit.ts**: log JSONL nao e rotacionado; em uso prolongado o arquivo cresce sem limite.

---

_Documento gerado automaticamente pelo turbo-agent em 6/19/2026._
