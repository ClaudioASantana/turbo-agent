# Análise de `src/audit.ts`

## Visão geral
`src/audit.ts` é o sistema de registro e rastreabilidade do Turbo-Agent. Ele implementa uma trilha de auditoria persistente em SQLite para gravar todas as ações críticas, decisões do usuário e detecções de segurança.

## Bloco 1 — Tipos e Estrutura de Dados
- Define `AuditEventType`: categoriza eventos como chamadas de ferramenta (`tool_call`), resultados (`tool_result`), aprovações/negações do usuário, detecções de segredos, negação de permissão e ciclos de vida do agente.
- Interface `AuditEvent`: padroniza a estrutura de cada registro (timestamp, tipo, tool, args, resultado, mensagem e usuário).

**Responsabilidade:** definir o contrato de dados para a observabilidade do sistema.

## Bloco 2 — Persistência via SQLite
- Utiliza `sqlite3` para persistir logs no arquivo `.agent_audit.db`.
- `initDb()`: garante a existência da tabela `audit_logs` com colunas para todos os campos do evento.
- `logAuditEvent()`: grava eventos de forma assíncrona, tratando a serialização de argumentos em JSON.

**Responsabilidade:** garantir que a trilha de auditoria sobreviva ao reinício do agente.

## Bloco 3 — Funções de Conveniência
- Fornece wrappers especializados para facilitar o log:
  - `auditToolCall`: registra a intenção de usar uma ferramenta.
  - `auditToolResult`: registra a saída da ferramenta (com truncamento para evitar logs gigantes).
  - `auditUserDecision`: registra se o usuário aprovou ou negou uma ação.
  - `auditSecretDetected` e `auditPermissionDenied`: registram incidentes de segurança.

**Responsabilidade:** simplificar a instrumentação do código do agente.

## Bloco 4 — Recuperação e Estatísticas
- `readAuditLog()`: recupera os eventos mais recentes (default 100) e desserializa os argumentos.
- `getAuditStats()`: gera métricas agregadas por tipo de evento.

**Responsabilidade:** prover dados para dashboards de monitoramento e depuração.

## Bloco 5 — Sanitização de Dados
- `sanitizeArgs()`: remove valores sensíveis antes da gravação.
- Utiliza um regex (`/password|secret|token|key|auth|credential|api_key/i`) para mascarar valores com `[REDACTED]`.
- Trunca strings longas (> 200 caracteres) para otimizar o armazenamento.

**Responsabilidade:** evitar a persistência acidental de segredos no arquivo de log.

## Onde a complexidade está concentrada
- A complexidade é baixa, mas a importância é alta: é a única fonte de verdade sobre o que o agente fez "nas costas" do usuário ou onde ele falhou.

## Sinais de risco
- **Concorrência**: O uso de `sqlite3` sem um pool de conexões ou tratamento robusto de concorrência pode gerar erros de "database is locked" se houver muitas escritas simultâneas.
- **Performance**: Consultas sem índices (apenas `ORDER BY id DESC`) podem ficar lentas se o log crescer massivamente.
- **Segurança**: Embora sanitize chaves comuns, a sanitização é baseada em regex simples; valores sensíveis em chaves com nomes genéricos podem vazar.

## Leitura prática
É um módulo sólido de observabilidade. A implementação via SQLite é a escolha certa para um agente local, pois é leve e não requer infraestrutura externa.

## Resumo em uma frase
`src/audit.ts` fornece a "caixa-preta" do Turbo-Agent, registrando cada passo, decisão e incidente de segurança para fins de auditoria e depuração.
