# Análise de `src/tools.ts`

## Visão geral
`src/tools.ts` é o catálogo central de ferramentas do agente. Ele define o registro, validação, execução e retorno padronizado de praticamente tudo que o agente pode fazer fora do LLM.

## Bloco 1 — Infraestrutura base
**Linhas iniciais**
- Declara `backgroundProcesses` para controlar comandos em segundo plano.
- Define `resolveFilePath()` para localizar arquivos mesmo quando o caminho informado não existe exatamente.
- Define `searchFilesHelper()` para busca textual recursiva.
- Define `extractSignatures()` para análise estrutural leve de código.

**Responsabilidade:** prover utilitários de sistema e análise de código usados por várias tools.

## Bloco 2 — Tipos e registry
- Define `ToolResult`, `ToolDef`, `ErrorCategory` e a classe interna `Registry`.
- `Registry.execute()` valida args com Zod, executa a tool e normaliza erros.
- `getSchemas()` converte schemas Zod para formato OpenAI/MCP, limpando campos incompatíveis.

**Responsabilidade:** padronizar cadastro e execução das ferramentas.

## Bloco 3 — Ferramentas de arquivo e código
### `read_file`
- Lê conteúdo de arquivo.

### `list_files`
- Lista diretório.

### `write_file`
- Sobrescreve o arquivo inteiro.
- É explicitamente perigosa.

### `replace_in_file`
- Substitui todas as ocorrências exatas de uma string.

### `patch_file`
- Substitui um intervalo de linhas.

### `multi_replace_in_file`
- Faz múltiplas substituições em uma única passagem.

### `search_files`
- Busca string exata em todos os arquivos de uma árvore.

### `analyze_codebase`
- Extrai assinaturas estruturais de arquivos e diretórios.

**Responsabilidade:** manipulação e inspeção do código-fonte.

## Bloco 4 — Ferramentas de execução e processo
### `run_command`
- Executa comando via `AgentTerminal`.
- Aceita `cwd`.
- Marcada como perigosa.

### `start_background_command`
- Inicia processo em segundo plano.
- Armazena logs e status em `backgroundProcesses`.

### `read_process_logs`
- Lê logs do processo em background.

### `stop_background_process`
- Encerra processo em background.

**Responsabilidade:** execução de comandos e gerenciamento de processos locais.

## Bloco 5 — Ferramentas de internet
### `web_search`
- Faz scraping do DuckDuckGo HTML.
- Extrai título, snippet e URL.

### `fetch_url`
- Baixa uma URL e retorna texto limpo extraído do HTML.

**Responsabilidade:** recuperar conteúdo externo para o agente.

## Bloco 6 — Ferramentas de finalização e aprovação
### `finish_task`
- Marca a tarefa como concluída.

### `request_user_approval`
- Mostra plano e pede confirmação humana.

**Responsabilidade:** encerrar ciclos e aplicar HITL.

## Bloco 7 — Delegação e browser
### `invoke_subagent`
- Delega tarefa para subagente em contexto isolado.

### `browser_navigate`, `browser_click`, `browser_type`, `browser_extract`
- Controlam sessão de browser.

**Responsabilidade:** fan-out de trabalho e automação de browser.

## Onde a complexidade está concentrada
1. **Registry e schema conversion** — núcleo infra de tudo.
2. **Ferramentas de arquivo** — maior superfície de risco por escrita no filesystem.
3. **Ferramentas de processo** — comandos e background processes aumentam superfície operacional.
4. **Ferramentas de browser/web** — integração com mundo externo e parsing frágil.

## Sinais de risco
- Muitas ferramentas num único arquivo.
- Mistura de preocupações: filesystem, shell, web scraping, browser, subagents e aprovação humana.
- `resolveFilePath()` faz busca recursiva ampla; útil, mas pode mascarar erros de caminho.
- `write_file` é totalmente destrutiva por padrão.
- `run_command` e processos em background aumentam muito a superfície de execução.
- `web_search` depende de scraping de HTML, que é mais frágil que uma API estável.

## Minha leitura prática
O arquivo é funcional, mas está perto do limite de acoplamento. Os cortes mais naturais seriam:
1. separar tools por domínio;
2. isolar execução de shell em um módulo próprio;
3. isolar browser/web em outro módulo;
4. separar análise de código das ferramentas de mutação de arquivos;
5. manter o registry como camada fina de composição.

## Resumo em uma frase
`src/tools.ts` é a central de poder do agente: muito capaz, mas também o ponto onde risco operacional, complexidade e acoplamento se acumulam mais rápido.
