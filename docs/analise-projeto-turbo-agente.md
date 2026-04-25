# Análise do Projeto Turbo-Agente

## Visão Geral
O turbo-agente é um projeto TypeScript que implementa um **agente de IA autônomo** capaz de interagir com o sistema de arquivos local e executar comandos. Ele usa um modelo de linguagem local (Qwen 2.5 Coder) via API compatível com OpenAI.

## Arquitetura Modular

### 1. agent.ts - Núcleo do Agente
- Mantém histórico global de mensagens com sliding window (máx. 20 mensagens)
- Loop de execução com máximo de 15 iterações
- Persistência do histórico em `.agent_history.json`
- Controle humano para operações perigosas

### 2. llmClient.ts - Cliente LLM
- Wrapper para API OpenAI-compatible
- Configurável via variáveis de ambiente

### 3. parser.ts - Parser de Respostas
- Extrai chamadas de ferramentas das respostas do LLM

### 4. tools.ts - Implementação das Ferramentas
- read_file, write_file, run_command, replace_in_file, search_files, etc.

### 5. promptUser.ts - Interação com Usuário
- Solicita aprovação para operações perigosas

## Funcionalidades Principais

- **Operação Autônoma**: O agente raciocina e executa múltiplas chamadas de ferramentas sequencialmente
- **Controle Humano**: Requer aprovação do usuário para operações perigosas (write_file, run_command, replace_in_file)
- **Memória Persistente**: Salva e restaura histórico de conversas
- **Sliding Window**: Limita contexto para evitar limites de tokens
- **Suporte a LLM Local**: Funciona com Ollama, OpenRouter, etc.

## Configuração

- Modelo padrão: `qwen-35b-turboquant`
- Endpoint: `http://localhost:8081/v1` (Ollama)
- Variáveis de ambiente no `.env`

## Segurança

- Máximo 15 iterações por tarefa
- Aprovação humana obrigatória para modificações de arquivo
- Truncamento de saída em 3000 caracteres

## Casos de Uso

- Edição e refatoração de código
- Operações no sistema de arquivos
- Execução de comandos e scripts
- Tarefas autônomas com supervisão humana
