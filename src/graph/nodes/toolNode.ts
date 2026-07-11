import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { ToolRegistry } from "../../tools";
import { SecurityManager } from "../../securityManager";
import { auditToolCall, auditToolResult } from "../../audit";
import pc from "picocolors";
import { validateBuildAfterWrite } from "./buildValidator";
import { buildSelfHealMessage, truncateResult } from "../utils";

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
        if (["read_file", "list_files", "search_files", "semantic_search"].includes(toolName)) {
           console.log(pc.cyan(`\n🔍 Buscando informação (${toolName})...`));
        } else {
           console.log(pc.yellow(`\n⚙️  Executando ferramenta: ${toolName}...`));
        }
      }

      const auth = await SecurityManager.authorize(toolName, args, isSubagent);
      if (!auth.approved) {
        newMessages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: auth.userMessage }));
        currentErrors++;
        continue;
      }

      auditToolCall(toolName, args);
      let toolResult = await ToolRegistry.execute(toolName, args);
      toolResult = await validateBuildAfterWrite(toolName, toolResult, isSubagent);

      auditToolResult(toolName, JSON.stringify(toolResult));

      const resultString = truncateResult(JSON.stringify(toolResult));

      if (!toolResult.success) {
        currentErrors++;
        const errorMsg = buildSelfHealMessage(resultString, state.consecutiveErrors + 1);
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
