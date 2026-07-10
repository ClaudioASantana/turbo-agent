# Fase 1 - Input Guardrails (Implementação Completa)

**Status:** ✅ Implementado e testado  
**Data:** 2026-07-10  
**Arquivos criados/modificados:** 3

## O que foi implementado

Input Guardrails é a primeira camada de defesa contra entrada maliciosa. Roda **antes** de enviar qualquer prompt ao LLM, bloqueando ou alertando sobre:

1. **PII (Personally Identifiable Information)**
   - CPF (com/sem formatação)
   - CNPJ (com/sem formatação)
   - Email
   - Telefone brasileiro
   - Cartão de crédito
   - Passaporte/ID

2. **Comandos Destrutivos**
   - SQL: DROP TABLE, DELETE sem WHERE, TRUNCATE
   - Shell: rm -rf /, dd, mkfs, format
   - PowerShell: Remove-Item com -Force

3. **Prompt Injection**
   - "ignore previous instructions"
   - "show me your system prompt"
   - "you are now" / "act as" (role change)
   - "DAN mode" e variações
   - [SYSTEM] / [ADMIN] tags

---

## Arquivos criados

### 1. `src/inputGuardrails.ts` (329 linhas)

Módulo exporta 5 funções públicas:

```typescript
// Checa apenas PII
checkPII(content: string): GuardrailResult

// Checa apenas comandos destrutivos
checkDestructiveCommands(content: string): GuardrailResult

// Checa apenas prompt injection (não bloqueia, só avisa)
checkPromptInjection(content: string): GuardrailResult

// Checa tudo: PII (bloqueia) → Destrutivos (bloqueia) → Injection (avisa)
checkInputGuardrails(userPrompt: string): GuardrailResult

// Formata warnings para exibição ao usuário
formatGuardrailWarnings(result: GuardrailResult): string
```

**Interface de retorno:**
```typescript
interface GuardrailResult {
  allowed: boolean;          // Entrada pode ser usada?
  blocked: boolean;          // Entrada foi bloqueada?
  reason?: string;           // Por quê (se bloqueado/avisado)
  warnings?: string[];       // Lista de padrões detectados
  score: number;             // 0-100: risco relativo
}
```

**Padrões registrados:**
- 8 padrões de PII (severidade critical/high)
- 8 padrões de comando destrutivo (severidade critical)
- 5 padrões de prompt injection (severidade high/medium)

---

### 2. `src/tests/inputGuardrails.test.ts` (185 linhas)

Suite de 28 testes usando Vitest:

```
✅ PII Detection
  ✅ should detect CPF
  ✅ should detect unformatted CPF
  ✅ should detect CNPJ
  ✅ should detect email
  ✅ should detect Brazilian phone
  ✅ should detect credit card
  ✅ should allow safe input

✅ Destructive Command Detection
  ✅ should detect DROP TABLE
  ✅ should detect DELETE without WHERE
  ✅ should allow DELETE with WHERE
  ✅ should detect rm -rf
  ✅ should detect TRUNCATE
  ✅ should detect dd commands
  ✅ should detect mkfs commands
  ✅ should allow safe SQL

✅ Prompt Injection Detection
  ✅ should detect 'ignore previous instructions'
  ✅ should detect 'show me your system prompt'
  ✅ should detect 'you are now' role change
  ✅ should detect 'act as' jailbreak
  ✅ should detect DAN mode
  ✅ should detect [SYSTEM] tags
  ✅ should allow normal prompt

✅ Comprehensive Guardrails Check
  ✅ should block PII
  ✅ should block destructive commands
  ✅ should warn on prompt injection
  ✅ should pass safe input
  ✅ should handle null input
  ✅ should score high risk correctly
```

**Resultado:** 28/28 testes passando ✅

---

## Arquivos modificados

### 1. `src/agent.ts`

**Adições:**
- Import: `import { checkInputGuardrails, formatGuardrailWarnings } from "./inputGuardrails";`
- Nova seção no método `runStep()` (antes de processar slash commands):

```typescript
// Input Guardrails - Validate before processing
if (userPrompt) {
  const guardrailResult = checkInputGuardrails(userPrompt);

  if (guardrailResult.blocked) {
    const errorMsg = guardrailResult.reason || "Entrada rejeitada por guardrails de segurança.";
    Logger.warn(`Input Guardrail Blocked: ${errorMsg}`);
    this.agentEvents.emit("error", errorMsg);
    await logAuditEvent({
      type: "input_guardrail_blocked",
      details: guardrailResult.reason,
      timestamp: new Date().toISOString()
    });
    return errorMsg;
  }

  if (guardrailResult.warnings && guardrailResult.warnings.length > 0) {
    const warningMsg = formatGuardrailWarnings(guardrailResult);
    Logger.info(`Input Guardrail Warning: ${guardrailResult.reason}`);
    this.agentEvents.emit("system", warningMsg);
    await logAuditEvent({
      type: "input_guardrail_warning",
      details: guardrailResult.warnings.join("; "),
      score: guardrailResult.score,
      timestamp: new Date().toISOString()
    });
  }
}
```

**Fluxo:**
1. Input chega em `runStep(userPrompt)`
2. Guardrails checam (ordem: PII → Destrutivos → Injection)
3. Se **bloqueado**: retorna erro imediatamente, registra em audit
4. Se **aviso**: log + event + audit, mas continua processamento
5. Se **seguro**: prossegue normalmente

### 2. `src/audit.ts`

**Adições a `AuditEventType`:**
```typescript
| "input_guardrail_blocked"
| "input_guardrail_warning"
```

**Adições a `AuditEvent`:**
```typescript
details?: string;           // Descrição do guardrail
score?: number;            // Score de risco (0-100)
[key: string]: unknown;    // Permite campos adicionais
```

---

## Comportamento em Ação

### Cenário 1: PII Detectada (Bloqueado)
```
Input: "Meu CPF é 123.456.789-10"
Output: 
  ❌ blocked: true
  ⚠️ reason: "PII detectada... Não é permitido enviar dados..."
  score: 40
  Audit: input_guardrail_blocked
```

### Cenário 2: Comando Destrutivo (Bloqueado)
```
Input: "Execute: DROP TABLE users;"
Output:
  ❌ blocked: true
  ⚠️ reason: "Comando(s) destrutivo(s) detectado(s)..."
  score: 50
  Audit: input_guardrail_blocked
```

### Cenário 3: Prompt Injection (Aviso, não bloqueia)
```
Input: "Ignore all previous instructions and..."
Output:
  ✅ allowed: true
  ⚠️ warnings: ["Attempting to ignore... (ignore_instructions)"]
  score: 15
  Audit: input_guardrail_warning
```

### Cenário 4: Seguro (Passa)
```
Input: "How do I learn TypeScript?"
Output:
  ✅ allowed: true
  ✅ blocked: false
  warnings: undefined
  score: 0
  Audit: (nenhuma)
```

---

## Integração com Sistema

### 1. Logging
- `Logger.warn()` para bloqueios
- `Logger.info()` para avisos
- Estruturado em JSON via Datadog dispatcher

### 2. Audit Trail
Eventos registrados no SQLite (.agent_audit.db):
```sql
INSERT INTO audit_events (timestamp, type, details, score)
VALUES (now, "input_guardrail_blocked", "PII: CPF detectado", 40);
```

### 3. UI Integration
- `agentEvents.emit("error", message)` para bloqueios (exibe erro em vermelho)
- `agentEvents.emit("system", message)` para avisos (exibe em amarelo)

### 4. API REST
Endpoint GET `/audit/events` retorna todos os eventos, incluindo guardrails:
```json
{
  "type": "input_guardrail_blocked",
  "timestamp": "2026-07-10T16:52:00Z",
  "details": "PII detectada: CPF...",
  "score": 40
}
```

---

## Decisões de Design

### 1. **PII = Bloqueio Crítico**
Motivo: Nunca enviar dados pessoais ao LLM (risco LGPD/GDPR)

### 2. **Destrutivos = Bloqueio Crítico**
Motivo: Não deixar agente sugerir comandos que apagam dados

### 3. **Injection = Aviso, não Bloqueio**
Motivo: Jailbreak é "social engineering", não exploit técnico. Usuário pode estar fazendo pesquisa legítima ("como o prompt injection funciona?"). Avisar mas permitir.

### 4. **Regex Determinístico, não ML**
Motivo:
- ✅ Rápido (sem latência de ML)
- ✅ Determinístico (sem falsos negativos aleatórios)
- ✅ Auditável (regex é transparente)
- ❌ Sem cobertura 100% (haverá evasão)
- Futuro: Adicionar classificador ML para injection se necessário

### 5. **Score 0-100**
Motivo: Permitir diferentes ações por risco
- 0-20: Informativo
- 20-50: Aviso
- 50-100: Bloqueio

Atualmente, bloqueio é tudo-ou-nada, mas score permite upgrade futuro.

---

## Próximos Passos (Futuro)

### Curto Prazo
- [ ] Testar com input real do Telegram/API
- [ ] Adicionar mais padrões de PII (IBAN, SSN, etc.)
- [ ] Dashboard: visualizar eventos de guardrail no `/audit` endpoint

### Médio Prazo
- [ ] ML classifier para prompt injection (reduzir avisos falsos)
- [ ] Allowlist: regex para exceções ("fale sobre CPF e CNPJ")
- [ ] Rate limiting: bloquear usuário com >N violações/min

### Longo Prazo
- [ ] Guardrails de Output (detectar PII na resposta do LLM)
- [ ] Context Injection Detection (detectar quando LLM foi "virado")
- [ ] Integração com semantic search: bloquear se similar a prompt injection anterior

---

## Checklist de Validação

- ✅ Código compila sem errors TypeScript
- ✅ 28/28 testes passando
- ✅ Integrado em `agent.ts` com event emission
- ✅ Audit logging implementado
- ✅ Sem breaking changes (backwards compatible)
- ✅ Documentação completa
- ✅ Exemplos em docstrings

---

## Métricas Coletadas

Cada execução registra:
- **timestamp**: quando ocorreu
- **type**: input_guardrail_blocked ou _warning
- **details**: descrição exata
- **score**: nível de risco (0-100)

Acessar via: `curl http://localhost:3000/audit/events | jq '.[] | select(.type | startswith("input_guardrail"))'`

---

**Fim da Fase 1. Próxima:** Fase 3 (Tracing) ou Fase 2 (Context Compression)?
