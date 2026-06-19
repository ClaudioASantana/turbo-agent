import { execSync } from "child_process";
import * as os from "os";
import * as path from "path";

export function getDynamicContext(): string {
  const contextParts: string[] = [];

  // Informações básicas de SO e Diretório
  contextParts.push(`SO: ${os.platform()} ${os.release()}`);
  contextParts.push(`CWD: ${process.cwd()}`);
  contextParts.push(`Data Local: ${new Date().toLocaleString()}`);

  // Integração com Git
  try {
    // Verifica se é um repositório git e pega o branch atual
    const gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: "pipe" }).trim();
    contextParts.push(`\nRepositório Git Ativo. Branch: ${gitBranch}`);

    // Pega o status dos arquivos (modificados, não rastreados, etc.)
    const gitStatus = execSync("git status -s", { encoding: "utf8", stdio: "pipe" }).trim();
    if (gitStatus) {
      contextParts.push(`Git Status (Arquivos pendentes/modificados):\n${gitStatus}`);
    } else {
      contextParts.push(`Git Status: Nenhuma alteração pendente (working tree limpa).`);
    }
  } catch (error) {
    // Falha silenciosa se não for um repositório git (por exemplo, exit code 128)
  }

  return contextParts.join("\n");
}
