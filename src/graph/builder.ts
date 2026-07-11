import { StateGraph, START, END } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { AgentState } from "./state";
import { explorerNode } from "./nodes/explorerNode";
import { architectNode } from "./nodes/architectNode";
import { coderNode } from "./nodes/coderNode";
import { qaNode } from "./nodes/qaNode";
import { createToolNode } from "./nodes/toolNode";
import { routerNode } from "./nodes/routerNode";
import { chatNode } from "./nodes/chatNode";

const END_PLACEHOLDER = END;

const routeFromRouter = (state: typeof AgentState.State) => {
  if (state.context === "chat") return "chatNode";
  return "explorerNode";
};

const routeFromExplorer = (state: typeof AgentState.State) => {
  const lastMessage = state.messages[state.messages.length - 1] as any;
  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) return "tools";
  if (state.context) return "architectNode";
  return END_PLACEHOLDER;
};

const routeFromArchitect = (_state: typeof AgentState.State) => "coderNode";

const routeFromCoder = (state: typeof AgentState.State) => {
  if (state.consecutiveErrors >= 3) return END_PLACEHOLDER;
  const lastMessage = state.messages[state.messages.length - 1] as any;
  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) return "tools";
  if (state.finalAnswer) return "qaNode";
  return END_PLACEHOLDER;
};

const routeFromTools = (state: typeof AgentState.State) => {
  if (state.sender === "qaNode") return "qaNode";
  return state.sender === "explorerNode" ? "explorerNode" : "coderNode";
};

const routeFromQA = (state: typeof AgentState.State) => {
  const lastMessage = state.messages[state.messages.length - 1] as any;
  if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) return "tools";
  if (!state.finalAnswer) return "coderNode";
  return END_PLACEHOLDER;
};

export function createAgentGraph(isSubagent: boolean, checkpointer: PostgresSaver) {
  const toolNode = createToolNode(isSubagent);

  const workflow = new StateGraph(AgentState)
    .addNode("routerNode", routerNode)
    .addNode("chatNode", chatNode)
    .addNode("explorerNode", explorerNode)
    .addNode("architectNode", architectNode)
    .addNode("coderNode", coderNode)
    .addNode("qaNode", qaNode)
    .addNode("tools", toolNode)
    
    .addEdge(START, "routerNode")
    .addConditionalEdges("routerNode", routeFromRouter)
    .addEdge("chatNode", END)
    
    .addConditionalEdges("explorerNode", routeFromExplorer)
    .addConditionalEdges("architectNode", routeFromArchitect)
    
    .addConditionalEdges("coderNode", routeFromCoder)
    .addConditionalEdges("tools", routeFromTools)
    
    .addConditionalEdges("qaNode", routeFromQA);

  return workflow.compile({ 
    checkpointer: checkpointer,
    interruptBefore: isSubagent ? [] : ["coderNode"]
  });
}
