import { exec } from "child_process";
import { promisify } from "util";
import { ErrorCategory, ToolResult } from "../../tools";

const execAsync = promisify(exec);
const writeTools = ["write_file", "replace_in_file", "patch_file", "multi_replace_in_file"];

export async function validateBuildAfterWrite(toolName: string, toolResult: ToolResult, isSubagent: boolean): Promise<ToolResult> {
  if (isSubagent || !toolResult.success || !writeTools.includes(toolName)) return toolResult;

  try {
    await execAsync("npx tsc --noEmit");
    return toolResult;
  } catch (e: any) {
    return {
      ...toolResult,
      success: false,
      category: ErrorCategory.EXECUTION,
      error: `O arquivo foi salvo, mas a compilação falhou:\n${e.stdout || e.message}`,
    };
  }
}
