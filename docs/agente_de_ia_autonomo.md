# Qwen Local Agent - Análise da Arquitetura

O projeto **`qwen-local-agent`** é um assistente autônomo (agente) desenvolvido em TypeScript, projetado para rodar localmente no computador, integrado com a API do **Ollama** utilizando modelos da família Qwen (como o `qwen2.5-coder:14b`).

Abaixo está um resumo técnico da arquitetura, funcionalidades e de como o projeto funciona:

## 1. Visão Geral da Arquitetura

O sistema é estruturado em torno de um loop interativo (REPL) que mantém o contexto de uma conversa e permite ao modelo de IA raciocinar (`<think>`) e utilizar ferramentas sequenciais no sistema local antes de entregar uma resposta final.

* **`src/index.ts`**: O ponto de entrada. Inicia a interface de linha de comando iterativa. Carrega o histórico salvo em arquivo (`.agent_history.json`) e escuta os prompts do usuário.
* **`src/agent.ts`**: É o "cérebro" do agente. Ele controla o loop principal de ações (com um máximo de 15 iterações para evitar loops infinitos). Ele invoca o modelo local através de uma configuração compatível com OpenAI (apontando para o Ollama na porta `11434`), processa o retorno e executa as chamadas de ferramentas. Ele também gerencia ativamente o tamanho do contexto através de um **Sliding Window** (limitando às últimas 20 mensagens) para evitar estourar o limite de tokens.
* **`src/parser.ts`**: Implementa uma lógica robusta de extração. Como modelos locais às vezes se perdem na formatação JSON, este script ignora conteúdos dentro das tags de raciocínio `<think>...</think>` e tenta fazer o *parse* lidando com blocos markdown (` ```json `).
* **`src/llmClient.ts`**: Usa a biblioteca oficial `openai` do Node.js, mas configurada para bater no `http://localhost:11434/v1`.
* **`Modelfile`**: Define um template complexo do ChatML focado na estrutura de `tools`. Observa-se que ele é construído sobre uma base robusta (`Qwen3.6-35B-A3B-UD-IQ4_XS.gguf`), o que mostra tentativas de otimizar a instrução do prompt para garantir que as "function calls" funcionem corretamente. (Observação: no `agent.ts`, a chamada via API chama o modelo `qwen2.5-coder:14b`).

## 2. Arsenal de Ferramentas (`src/tools.ts`)

O agente conta com um conjunto bastante sofisticado de capacidades do sistema operacional e da web. Ele envia as requisições em JSON puro (simulado via prompt, já que a interface direta de tool calling pode ser customizada no Modelfile):

* **Sistema de Arquivos:** Conta com `read_file`, `write_file`, `list_files`, `patch_file` e `replace_in_file`. Uma funcionalidade interessante é a `analyze_codebase`, que lê arquivos TypeScript/JavaScript e através de expressões regulares extrai as "assinaturas" de funções e classes, permitindo o modelo "ler" projetos grandes sem esgotar sua janela de contexto.
* **Terminal e Execução:** Pode rodar comandos síncronos via `run_command` e possui ferramentas poderosas assíncronas para iniciar processos, ler seus logs e pará-los (`start_background_command`, `read_process_logs`, `stop_background_process`).
* **Navegação Web e Busca:** Conta com busca na internet através de raspagem (scraping) do HTML bruto do DuckDuckGo usando a biblioteca `cheerio` (na ferramenta `web_search`) e extração limpa de textos em páginas com o `fetch_url`.

## 3. Mecanismos de Segurança e Controle

O projeto possui lógicas maduras de proteção local, o que é fundamental para agentes com acesso a terminal e leitura de disco:

* **Human-in-the-Loop:** Caso o agente tente chamar ferramentas com potencial destrutivo (como `write_file`, `replace_in_file` ou `run_command`), o código pausa a execução e exige permissão via console (`⚠️ O Agente quer executar a ferramenta perigosa... Aprovar? [y/N]`). Se o usuário negar, ele devolve o erro ao LLM para que este reavalie a ação.
* **Truncamento de Logs:** Quando a execução de uma ferramenta retorna muitos dados (ex: um erro muito grande ou a leitura de um diretório lotado), se a saída passar de 3000 caracteres, a string é truncada, salvando assim espaço valioso no contexto do modelo.
