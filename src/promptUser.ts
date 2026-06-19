import { input, confirm } from "@inquirer/prompts";
import pc from "picocolors";

export async function promptUser(question: string): Promise<string> {
  return await input({ message: pc.cyan(pc.bold(question)) });
}

export async function confirmAction(message: string, defaultAnswer: boolean = false): Promise<boolean> {
  return await confirm({ message, default: defaultAnswer });
}
