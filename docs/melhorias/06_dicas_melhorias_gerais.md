# Dicas de Melhoria — Análise Geral do `turbo-agent`

> Gerado em: 19/06/2026

---

## Pontos Fortes Atuais

- **Arquitetura modular**: `agent.ts`, `tools.ts`, `llmClient.ts`, `context.ts`, `memory.ts` bem separados
- **Contexto dinâmico**: injeta SO, CWD, branch Git e status no prompt
- **Histórico persistente**: salva/restaura sessões via `.agent_history.json`
- **Compactação de memória**: usa LLM para resumir histórico longo
- **Subagentes**: suporte a tarefas delegadas isoladas
- **Confirmação de ações perigosas**: proteção antes de executar ferramentas destrutivas
- **RAG/Busca semântica**: `.agent_embeddings.json` já presente

---

## Melhorias de Alta Prioridade

### 1. Testes automatizados com Vitest

O projeto tem scripts de teste manuais (`test-rag.mjs`, `test-search.ts`, `test-login.js`) mas sem suíte formal.

```bash
npm install -D vitest tsx
```

Testes prioritários:
- Parser de tool calls (`src/parser.ts`)
- Registry de ferramentas
- Compactação de histórico
- Resolução de arquivos
- Contexto Git

---

### 2. Sistema formal de permissões por ferramenta

```ts
type Permission = 'allow' | 'confirm' | 'deny';

const toolPermissions: Record<string, Permission> = {
  read_file: 'allow',
  write_file: 'confirm',
  run_command: 'confirm',
  web_search: 'allow',
};
```

Benefícios: modo somente-leitura, modo CI seguro, auditoria.

---

### 3. Melhorar parser de respostas do LLM (`src/parser.ts`)

- Tolerar JSON dentro de blocos Markdown
- Aceitar múltiplas tool calls por resposta
- Validar schema antes de executar
- Retornar erros recuperáveis ao modelo
- Logar falhas em modo debug

---

### 4. Log estruturado de auditoria

```json
{
  "timestamp": "2026-06-19T18:00:00Z",
  "tool": "write_file",
  "args": { "path": "src/foo.ts" },
  "status": "success",
  "durationMs": 42
}
```

Facilita debugging, rastreabilidade e geração de changelog.

---

### 5. Proteção contra secrets em commits

Antes de qualquer commit/PR, escanear por padrões como:
- API keys, tokens GitHub, JWTs, private keys
- Senhas hardcoded, connection strings

---

## Melhorias de Média Prioridade

### 6. Arquivo de configuração por projeto

```json
// .agentrc ou turbo-agent.config.json
{
  "model": "qwen-35b-turboquant",
  "maxIterations": 256,
  "maxMessages": 20,
  "autoApproveReadOnly": true,
  "ignoredPaths": ["node_modules", "dist", ".git"]
}
```

---

### 7. RAG incremental

O projeto já tem `.agent_embeddings.json`. Evoluções:
- Indexação incremental (só re-indexa arquivos alterados)
- Chunking por função/classe em vez de tamanho fixo
- Ranking híbrido: embeddings + busca textual
- Comando `turbo-agent index` para reconstruir

---

### 8. Melhorar UX do CLI

Comandos slash interativos:
```
/help  /model  /status  /history  /reset  /tools  /permissions
```

- Exibir diff colorido antes de escrever arquivos
- Modo verbose/debug
- Modo quiet para CI
- Exportar sessão em Markdown

---

### 9. Perfis de modelo configuráveis

```json
{
  "profiles": {
    "local": { "baseURL": "http://localhost:8080/v1", "model": "qwen" },
    "openrouter": { "baseURL": "https://openrouter.ai/api/v1", "model": "anthropic/claude-sonnet-4" }
  }
}
```

Uso: `turbo-agent --profile openrouter`

---

## Novidades Interessantes para Implementar

### 10. Modo `plan/apply`

- `plan`: agente analisa e propõe mudanças sem executar
- `apply`: executa mudanças aprovadas

Reduz risco em tarefas grandes e dá mais controle ao desenvolvedor.

---

### 11. Subagentes especializados

Já existe suporte a subagentes. Evoluir para papéis fixos com prompts e permissões próprias:

| Papel | Responsabilidade |
|---|---|
| `security-reviewer` | Analisa vulnerabilidades |
| `test-writer` | Gera testes automaticamente |
| `bug-hunter` | Investiga erros |
| `docs-writer` | Documenta código |
| `refactor-planner` | Planeja refatorações |
| `dependency-auditor` | Audita dependências |

---

### 12. Replay de sessão

```bash
turbo-agent replay .agent_history.json
turbo-agent export-session session.md
```

Permite revisar o que o agente fez, compartilhar sessões e criar tutoriais.

---

### 13. Gerador automático de testes

```bash
turbo-agent generate-tests src/parser.ts
```

Fluxo:
1. Lê arquivo alvo
2. Identifica funções exportadas
3. Gera testes unitários
4. Roda testes
5. Ajusta até passar

---

### 14. Mapa de arquitetura

```bash
turbo-agent map
```

Gera diagrama Mermaid do projeto: módulos, dependências, exports, fluxos principais.

---

## Melhorias de Segurança

1. **Não versionar `.env`** — verificar se está no `.gitignore`
2. **Sanitizar logs** — mascarar campos como `password`, `token`, `apiKey`, `secret`
3. **Confirmação para escrita fora do CWD** — bloquear acesso fora do projeto
4. **Prevenção contra prompt injection** — conteúdo de arquivos não deve sobrescrever instruções do sistema
5. **Timeout global por iteração** — evitar loops longos ou comandos travados

---

## Roadmap Sugerido

| Fase | Ação |
|---|---|
| **Curto prazo** | Vitest + testes para parser/tools |
| **Curto prazo** | Logs estruturados de execução |
| **Curto prazo** | Proteção contra secrets |
| **Médio prazo** | Sistema de permissões formal |
| **Médio prazo** | `.agentrc` por projeto |
| **Médio prazo** | RAG incremental |
| **Longo prazo** | Subagentes especializados |
| **Longo prazo** | Modo plan/apply |
| **Longo prazo** | UI web para acompanhar execução |

---

## Primeira Implementação Recomendada

**Vitest + testes para `src/parser.ts` e `src/tools.ts`**

Porque aumenta a segurança para evoluir o agente sem quebrar o que já funciona.
É o alicerce para todas as outras melhorias.
