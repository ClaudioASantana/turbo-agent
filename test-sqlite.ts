import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
const checkpointer = SqliteSaver.fromConnString(".langgraph_memory.db");
console.log("SqliteSaver loaded:", !!checkpointer);
