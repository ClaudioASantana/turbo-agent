import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { ToolRegistry, ErrorCategory } from "../../tools";
import { SecurityManager } from "../../securityManager";
import { auditToolCall, auditToolResult } from "../../audit";
import { exec } from "child_process";
import { promisify } from "util";
import pc from "picocolors";

const execAsync = promisify(exec);

export const createToolNode = (isSubagent: boolean) => {
  return async (state: any) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];
    const newMessages: BaseMessage[] = [];
    let currentErrors = 0;
    let finalAnswer: string | null = null;

    for (const call of toolCalls) {
      const toolName = call.name;
      const args = call.args;

      if (toolName === "finish_task") {
        finalAnswer = args.finalAnswer || "Concluído";
        if (!isSubagent) {
          console.log(pc.green(`\n🤖 Turbo-Agent Finalizou:\n${finalAnswer}\n`));
        }
        newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: "Task finished." }));
        continue;
      }

      if (!isSubagent) {
        console.log(pc.yellow(`\n🔧 Executando ferramenta nativa: ${toolName}`));
      }

      const auth = await SecurityManager.authorize(toolName, args, isSubagent);
      if (!auth.approved) {
        newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: auth.userMessage }));
        currentErrors++;
        continue;
      }

      auditToolCall(toolName, args);
      let toolResult = await ToolRegistry.execute(toolName, args);

      const writeTools = ["write_file", "replace_in_file", "patch_file", "multi_replace_in_file"];
      if (toolResult.success && writeTools.includes(toolName)) {
        try {
          await execAsync("npx tsc --noEmit");
        } catch (e: any) {
          toolResult.success = false;
          toolResult.category = ErrorCategory.EXECUTION;
          toolResult.error = `O arquivo foi salvo, mas a compilação falhou:\n${e.stdout || e.message}`;
        }
      }

      auditToolResult(toolName, JSON.stringify(toolResult));

      let resultString = JSON.stringify(toolResult);
      if (resultString.length > 3000) {
        resultString = resultString.substring(0, 3000) + "\n... [Saída truncada]";
      }

      if (!toolResult.success) {
        currentErrors++;
        const errorMsg = `Tool failed:\n${resultString}\n\n[SELF-HEALING]: Analise o erro, corrija os argumentos e tente novamente. Tentativa ${state.consecutiveErrors + 1} de 3.`;
        newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: errorMsg }));
      } else {
        newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: resultString }));
      }
    }

    return {
      messages: newMessages,
      consecutiveErrors: currentErrors > 0 ? state.consecutiveErrors + 1 : 0,
      finalAnswer
    };
  };
};
