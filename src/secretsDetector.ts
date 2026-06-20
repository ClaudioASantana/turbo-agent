/**
 * Detects common secret patterns in text content.
 * Used to warn (or block) before writing files that may contain credentials.
 */

export interface SecretMatch {
  patternName: string;
  description: string;
  /** The matched string, partially redacted for display */
  preview: string;
  line: number;
}

interface SecretPattern {
  name: string;
  description: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {
    name: "aws_access_key",
    description: "AWS Access Key ID",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    name: "aws_secret_key",
    description: "AWS Secret Access Key (40 chars)",
    regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,
  },
  {
    name: "github_token_classic",
    description: "GitHub Personal Access Token (classic)",
    regex: /\bghp_[A-Za-z0-9]{36}\b/g,
  },
  {
    name: "github_token_fine",
    description: "GitHub Fine-Grained Personal Access Token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  },
  {
    name: "github_oauth",
    description: "GitHub OAuth Token",
    regex: /\bgho_[A-Za-z0-9]{36}\b/g,
  },
  {
    name: "openai_api_key",
    description: "OpenAI API Key",
    regex: /\bsk-[A-Za-z0-9]{20,}\b/g,
  },
  {
    name: "anthropic_api_key",
    description: "Anthropic API Key",
    regex: /\bsk-ant-[A-Za-z0-9\-_]{90,}\b/g,
  },
  {
    name: "google_api_key",
    description: "Google API Key",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  },
  {
    name: "stripe_secret",
    description: "Stripe Secret Key",
    regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/g,
  },
  {
    name: "stripe_publishable",
    description: "Stripe Publishable Key",
    regex: /\bpk_live_[0-9a-zA-Z]{24,}\b/g,
  },
  {
    name: "private_key_block",
    description: "PEM Private Key Block",
    regex: /-----BEGIN\s(?:RSA|EC|DSA|OPENSSH|ENCRYPTED)?\s?PRIVATE KEY-----/g,
  },
  {
    name: "jwt_token",
    description: "JSON Web Token (JWT)",
    regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    name: "generic_password_assignment",
    description: "Generic password assignment in config/env",
    regex: /(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"\s]{8,})['"]?/gi,
  },
  {
    name: "generic_secret_assignment",
    description: "Generic secret/token assignment",
    regex: /(?:secret|token|api_key|apikey|auth_key)\s*[=:]\s*['"]([^'"\s]{16,})['"]?/gi,
  },
  {
    name: "slack_token",
    description: "Slack API Token",
    regex: /\bxox[baprs]-[0-9A-Za-z\-]{10,}\b/g,
  },
  {
    name: "discord_token",
    description: "Discord Bot Token",
    regex: /\b[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}\b/g,
  },
  {
    name: "sendgrid_key",
    description: "SendGrid API Key",
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
  },
  {
    name: "twilio_key",
    description: "Twilio API Key",
    regex: /\bSK[0-9a-fA-F]{32}\b/g,
  },
];

/**
 * Scans the given text content for secret patterns.
 * Returns an array of matches with line numbers and previews.
 */
export function detectSecrets(content: string): SecretMatch[] {
  const lines = content.split("\n");
  const matches: SecretMatch[] = [];
  const seen = new Set<string>(); // deduplicate by pattern+line

  for (const pattern of SECRET_PATTERNS) {
    // Reset lastIndex for global regexes
    pattern.regex.lastIndex = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      pattern.regex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(line)) !== null) {
        const key = `${pattern.name}:${lineIdx}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const matched = match[0];
        const preview = redact(matched);

        matches.push({
          patternName: pattern.name,
          description: pattern.description,
          preview,
          line: lineIdx + 1,
        });
      }
    }
  }

  return matches;
}

/**
 * Returns true if the content contains any secret patterns.
 */
export function hasSecrets(content: string): boolean {
  return detectSecrets(content).length > 0;
}

/**
 * Formats detected secrets into a human-readable warning string.
 */
export function formatSecretsWarning(matches: SecretMatch[]): string {
  if (matches.length === 0) return "";

  const lines = [
    `⚠️  ATENÇÃO: ${matches.length} possível(is) secret(s) detectado(s) no conteúdo:`,
    "",
  ];

  for (const m of matches) {
    lines.push(`  • [Linha ${m.line}] ${m.description} (${m.patternName})`);
    lines.push(`    Preview: ${m.preview}`);
  }

  lines.push("");
  lines.push("  Verifique se não está expondo credenciais antes de continuar.");

  return lines.join("\n");
}

/**
 * Partially redacts a secret string for safe display.
 * Shows first 4 and last 4 characters, masks the rest.
 */
function redact(value: string): string {
  if (value.length <= 8) return "****";
  const visible = 4;
  const start = value.slice(0, visible);
  const end = value.slice(-visible);
  const masked = "*".repeat(Math.min(value.length - visible * 2, 12));
  return `${start}${masked}${end}`;
}
