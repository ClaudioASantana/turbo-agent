/**
 * Input Guardrails - Validates and filters user input before sending to LLM.
 * Prevents PII exposure, destructive commands, and prompt injection attacks.
 */

export interface GuardrailResult {
  allowed: boolean;
  blocked: boolean;
  reason?: string;
  warnings?: string[];
  score: number; // 0 = safe, 100 = dangerous
}

interface GuardrailPattern {
  name: string;
  description: string;
  regex: RegExp;
  severity: "critical" | "high" | "medium" | "low";
}

// PII Patterns (Brazilian focus)
const PII_PATTERNS: GuardrailPattern[] = [
  {
    name: "cpf",
    description: "CPF (Cadastro de Pessoas Físicas)",
    regex: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    severity: "critical",
  },
  {
    name: "cpf_unformatted",
    description: "CPF sem formatação",
    regex: /\b\d{11}\b(?!\d)/g,
    severity: "critical",
  },
  {
    name: "cnpj",
    description: "CNPJ (Cadastro Nacional da Pessoa Jurídica)",
    regex: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    severity: "critical",
  },
  {
    name: "cnpj_unformatted",
    description: "CNPJ sem formatação",
    regex: /\b\d{14}\b/g,
    severity: "critical",
  },
  {
    name: "email",
    description: "Email address",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    severity: "high",
  },
  {
    name: "phone_br",
    description: "Brazilian phone number (+55, 11 9xxxx-xxxx)",
    regex: /(?:\+55|55)?[-.\s]?(?:\([0-9]{2}\)|[0-9]{2})[-.\s]?(?:9)?[-.\s]?[0-9]{4}[-.\s]?[0-9]{4}/g,
    severity: "high",
  },
  {
    name: "credit_card",
    description: "Credit card number (16 digits)",
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    severity: "critical",
  },
  {
    name: "passport",
    description: "Passport or ID number",
    regex: /\b[A-Z]{2}\d{6,9}\b/g,
    severity: "high",
  },
];

// Destructive Command Patterns
const DESTRUCTIVE_PATTERNS: GuardrailPattern[] = [
  {
    name: "sql_drop",
    description: "SQL DROP statement",
    regex: /\b(DROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW))\b/gi,
    severity: "critical",
  },
  {
    name: "sql_delete_all",
    description: "SQL DELETE without WHERE clause",
    regex: /\bDELETE\s+FROM\s+\w+\s*[;]?\s*$/gmi,
    severity: "critical",
  },
  {
    name: "sql_truncate",
    description: "SQL TRUNCATE statement",
    regex: /\bTRUNCATE\s+TABLE\b/gi,
    severity: "critical",
  },
  {
    name: "shell_rm_rf",
    description: "rm -rf / or similar destructive shell commands",
    regex: /\brm\s+(-rf|-fr)\s+\/\b/gi,
    severity: "critical",
  },
  {
    name: "shell_dd",
    description: "dd command targeting /dev/zero or /dev/urandom",
    regex: /\bdd\s+if=\/dev\/(zero|urandom)\s+of=/gi,
    severity: "critical",
  },
  {
    name: "shell_format",
    description: "mkfs or format commands",
    regex: /\b(mkfs(\.[a-z0-9]+)?|format|fdisk)\s+[a-zA-Z0-9/.]+/gi,
    severity: "critical",
  },
  {
    name: "shell_sudo_rm",
    description: "sudo rm with force flag",
    regex: /\bsudo\s+rm\s+-/gi,
    severity: "critical",
  },
  {
    name: "powershell_remove",
    description: "PowerShell Remove-Item -Force",
    regex: /\bRemove-Item\s+.*-Force\b/gi,
    severity: "critical",
  },
];

// Prompt Injection Patterns (heuristic-based)
const INJECTION_PATTERNS: GuardrailPattern[] = [
  {
    name: "ignore_instructions",
    description: "Attempting to ignore previous instructions",
    regex: /\b(ignore|forget|disregard|override).{0,30}(previous|your|all|these|the\s+previous)?.{0,30}(instructions|rules|constraints|guidelines|prompt)\b/gi,
    severity: "high",
  },
  {
    name: "system_prompt_reveal",
    description: "Attempting to reveal system prompt",
    regex: /\b(show|reveal|tell|what|repeat|output|print|display)\s+(me\s+)?your\s+(system\s+)?prompt\b/gi,
    severity: "high",
  },
  {
    name: "role_change",
    description: "Attempting to change agent role or identity",
    regex: /\byou\s+are\s+now\s+|from\s+now\s+on\s+you\s+are\s+|act\s+as\s+|pretend\s+you\s+are\s+|roleplay\s+as\s+/gi,
    severity: "medium",
  },
  {
    name: "jailbreak_attempt",
    description: "Known jailbreak phrases",
    regex: /\b(DAN\s+mode|do\s+anything\s+now|GPT4\s+jailbreak|ignore\s+safety|disable\s+restrictions)\b/gi,
    severity: "high",
  },
  {
    name: "context_confusion",
    description: "Attempting to confuse context with meta-prompts",
    regex: /\[SYSTEM\]|\[ADMIN\]|\[DEVELOPER\]|\[INTERNAL\]|\[OVERRIDE\]/gi,
    severity: "medium",
  },
];

/**
 * Check input for PII exposure
 */
export function checkPII(content: string): GuardrailResult {
  const matches: GuardrailPattern[] = [];
  let maxSeverity: "low" | "medium" | "high" | "critical" = "low";
  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };

  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      matches.push(pattern);
      if (severityOrder[pattern.severity] > severityOrder[maxSeverity]) {
        maxSeverity = pattern.severity;
      }
    }
  }

  if (matches.length === 0) {
    return { allowed: true, blocked: false, score: 0 };
  }

  const score = matches.reduce(
    (sum, m) => sum + (m.severity === "critical" ? 40 : m.severity === "high" ? 20 : 10),
    0
  );

  return {
    allowed: maxSeverity !== "critical",
    blocked: maxSeverity === "critical",
    reason: `⚠️  PII detectada: ${matches.map((m) => m.description).join(", ")}. Não é permitido enviar dados pessoais identificáveis.`,
    warnings: matches.map((m) => `${m.description} (${m.name})`),
    score: Math.min(score, 100),
  };
}

/**
 * Check input for destructive commands
 */
export function checkDestructiveCommands(content: string): GuardrailResult {
  const matches: GuardrailPattern[] = [];

  for (const pattern of DESTRUCTIVE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      matches.push(pattern);
    }
  }

  if (matches.length === 0) {
    return { allowed: true, blocked: false, score: 0 };
  }

  const score = matches.length * 50; // Cada comando destrutivo adiciona 50 pontos

  return {
    allowed: false,
    blocked: true,
    reason: `🚫 Comando(s) destrutivo(s) detectado(s): ${matches.map((m) => m.description).join(", ")}. Operações que apagam dados não são permitidas.`,
    warnings: matches.map((m) => `${m.description} (${m.name})`),
    score: Math.min(score, 100),
  };
}

/**
 * Check input for prompt injection attempts
 */
export function checkPromptInjection(content: string): GuardrailResult {
  const matches: GuardrailPattern[] = [];
  let injectionScore = 0;

  for (const pattern of INJECTION_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      matches.push(pattern);
      injectionScore += pattern.severity === "high" ? 15 : 8;
    }
  }

  if (matches.length === 0) {
    return { allowed: true, blocked: false, score: 0 };
  }

  // Prompt injection é tratada como warning, não bloqueio total
  return {
    allowed: true,
    blocked: false,
    reason: `⚠️  Possível tentativa de prompt injection detectada: ${matches.map((m) => m.description).join(", ")}.`,
    warnings: matches.map((m) => `${m.description} (${m.name})`),
    score: Math.min(injectionScore, 100),
  };
}

/**
 * Comprehensive guardrail check - combines all checks
 */
export function checkInputGuardrails(userPrompt: string): GuardrailResult {
  if (!userPrompt || typeof userPrompt !== "string") {
    return { allowed: true, blocked: false, score: 0 };
  }

  // Check PII (critical - blocks)
  const piiResult = checkPII(userPrompt);
  if (piiResult.blocked) {
    return piiResult;
  }

  // Check Destructive Commands (critical - blocks)
  const destructiveResult = checkDestructiveCommands(userPrompt);
  if (destructiveResult.blocked) {
    return destructiveResult;
  }

  // Check Prompt Injection (warning - doesn't block)
  const injectionResult = checkPromptInjection(userPrompt);

  // Combine warnings and score
  const allWarnings = [
    ...(piiResult.warnings || []),
    ...(destructiveResult.warnings || []),
    ...(injectionResult.warnings || []),
  ];

  const maxScore = Math.max(piiResult.score, destructiveResult.score, injectionResult.score);

  return {
    allowed: true,
    blocked: false,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    reason:
      allWarnings.length > 0
        ? `⚠️  Guardrails detectaram ${allWarnings.length} aviso(s) de segurança.`
        : undefined,
    score: maxScore,
  };
}

/**
 * Format guardrail warnings for user display
 */
export function formatGuardrailWarnings(result: GuardrailResult): string {
  if (!result.warnings || result.warnings.length === 0) {
    return "";
  }

  const lines = [
    `⚠️  SEGURANÇA: ${result.warnings.length} aviso(s) detectado(s):`,
    "",
  ];

  for (const warning of result.warnings) {
    lines.push(`  • ${warning}`);
  }

  lines.push("");
  lines.push(
    "  Nota: A mensagem foi enviada mesmo com avisos. Tenha cuidado com dados sensíveis."
  );

  return lines.join("\n");
}
