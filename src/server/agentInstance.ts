import { Agent, agentEvents } from "../agent";

// Singleton agent instance used across the web server routes
export const agent = new Agent();
export { agentEvents };
