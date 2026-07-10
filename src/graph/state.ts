import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  consecutiveErrors: Annotation<number>({
    reducer: (x: any, y: any) => y,
    default: () => 0,
  }),
  finalAnswer: Annotation<string | null>({
    reducer: (x: any, y: any) => y,
    default: () => null,
  }),
  context: Annotation<string>({
    reducer: (x: any, y: any) => y,
    default: () => "",
  }),
  sender: Annotation<string>({
    reducer: (x: any, y: any) => y,
    default: () => "coderNode",
  })
});

export const normalizeMessages = (msgs: BaseMessage[]) => {
   const normalized: BaseMessage[] = [];
   for (let msg of msgs) {
       if (msg._getType() === "chat" || msg._getType() === "chat_chunk" || msg._getType() === "generic" || (msg.constructor && msg.constructor.name && msg.constructor.name.includes("ChatMessage"))) {
           msg = new AIMessage({
               content: msg.content,
               additional_kwargs: msg.additional_kwargs,
               response_metadata: msg.response_metadata,
               id: msg.id
           });
       }

       if (normalized.length > 0 && normalized[normalized.length - 1]._getType() === msg._getType()) {
            const prev = normalized[normalized.length - 1];
            const prevHasTools = (prev as any).tool_calls && (prev as any).tool_calls.length > 0;
            const currentHasTools = (msg as any).tool_calls && (msg as any).tool_calls.length > 0;
            const isToolMsg = msg._getType() === "tool";

            if (!isToolMsg && !prevHasTools && !currentHasTools) {
                const newContent = prev.content.toString() + "\n\n" + msg.content.toString();
                if (prev._getType() === "human") {
                    normalized[normalized.length - 1] = new HumanMessage({ content: newContent, additional_kwargs: prev.additional_kwargs, id: prev.id, name: prev.name });
                } else if (prev._getType() === "ai") {
                    normalized[normalized.length - 1] = new AIMessage({ content: newContent, additional_kwargs: prev.additional_kwargs, tool_calls: (prev as any).tool_calls, id: prev.id, name: prev.name });
                } else {
                    const clonedMsg = Object.assign(Object.create(Object.getPrototypeOf(prev)), prev);
                    clonedMsg.content = newContent;
                    normalized[normalized.length - 1] = clonedMsg;
                }
                continue;
            }
        }
       normalized.push(msg);
   }

   if (normalized.length > 0 && normalized[0]._getType() === "ai") {
       normalized.unshift(new HumanMessage("Continuando o contexto anterior da sessão..."));
   }

   return normalized;
};
