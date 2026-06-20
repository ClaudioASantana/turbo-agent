import { input, confirm, select } from "@inquirer/prompts";
import pc from "picocolors";
import { grantPermission } from "./permissions";
import path from "path";

export async function promptUser(question: string): Promise<string> {
  return await input({ message: pc.cyan(pc.bold(question)) });
}

export async function confirmAction(message: string, defaultAnswer: boolean = false): Promise<boolean> {
  return await confirm({ message, default: defaultAnswer });
}

export async function requestToolPermission(toolName: string, args: any): Promise<boolean> {
  const choices = [
    { name: "Sim (Aprovar apenas esta vez)", value: "yes" },
    { name: "Não (Negar)", value: "no" },
    { name: `Aprovar SEMPRE para a ferramenta '${toolName}' (Perigoso)`, value: "always_tool" }
  ];

  const targetFile = args?.file || args?.targetFile || args?.path;
  if (targetFile) {
    const absPath = path.resolve(targetFile);
    const dir = path.dirname(absPath) + path.sep;
    choices.splice(2, 0, { name: `Aprovar SEMPRE para o arquivo "${path.basename(absPath)}"`, value: "always_file" });
    choices.splice(3, 0, { name: `Aprovar SEMPRE para o diretório "${dir}"`, value: "always_dir" });
  }

  const answer = await select({
    message: pc.yellow(`⚠️ O Agente quer executar '${toolName}'. O que você deseja fazer?`),
    choices
  });

  if (answer === "no") return false;
  
  if (answer === "always_tool") grantPermission(toolName);
  if (answer === "always_file" && targetFile) grantPermission(toolName, targetFile, false);
  if (answer === "always_dir" && targetFile) {
      const dir = path.dirname(path.resolve(targetFile)) + path.sep;
      grantPermission(toolName, dir, true);
  }

  return true;
}
