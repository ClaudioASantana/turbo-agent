export function truncateResult(result: string, maxLen = 3000): string {
  if (result.length <= maxLen) return result;
  return result.substring(0, maxLen) + "\n... [Saída truncada]";
}

export function buildSelfHealMessage(result: string, attempt: number): string {
  return `Tool failed:\n${result}\n\n[SELF-HEALING]: Analise o erro, corrija os argumentos e tente novamente. Tentativa ${attempt} de 3.`;
}
