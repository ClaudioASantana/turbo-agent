import { execSync } from "child_process";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

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

  // File Tree Injection
  try {
    const tree = buildFileTree(process.cwd(), 2);
    contextParts.push(`\nEstrutura do Projeto (max depth 2):\n${tree}`);
  } catch (e) {
    // Falha silenciosa
  }

  return contextParts.join("\n");
}

function buildFileTree(dir: string, maxDepth: number, currentDepth: number = 0, indent: string = ""): string {
  if (currentDepth > maxDepth) return "";
  
  const ignored = [".git", "node_modules", "dist", ".next", ".venv", "__pycache__", "build", "coverage"];
  let output = "";
  
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    // Sort directories first, then files
    files.sort((a: fs.Dirent, b: fs.Dirent) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (ignored.includes(file.name)) continue;

      const isLast = i === files.length - 1;
      const prefix = isLast ? "└── " : "├── ";
      
      output += `${indent}${prefix}${file.name}${file.isDirectory() ? "/" : ""}\n`;
      
      if (file.isDirectory()) {
        const nextIndent = indent + (isLast ? "    " : "│   ");
        output += buildFileTree(path.join(dir, file.name), maxDepth, currentDepth + 1, nextIndent);
      }
    }
  } catch (e) {
    // Permission denied or other error
  }
  
  return output;
}
