import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import pc from 'picocolors';
import { ToolRegistry } from './tools';

const AGENTS_FILE = path.join(process.cwd(), '.custom_agents.json');

export interface CustomAgent {
    id: string;
    name: string;
    description: string;
    systemPrompt: string;
    allowedTools: string[];
}

export function loadCustomAgents(): CustomAgent[] {
    if (!fs.existsSync(AGENTS_FILE)) {
        return [];
    }
    try {
        const data = fs.readFileSync(AGENTS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(pc.red("Error loading custom agents: "), e);
        return [];
    }
}

export function saveCustomAgents(agents: CustomAgent[]) {
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf-8');
}

export async function registerCustomAgents() {
    const agents = loadCustomAgents();
    
    // First, remove existing custom agent tools to avoid duplicates when reloading
    // (A limitation of our current ToolRegistry is it doesn't have an unregister, 
    // but we can just overwrite them or handle duplicates gracefully. We will rely on overwriting).

    for (const agent of agents) {
        const toolName = `invoke_${agent.id}`;
        
        ToolRegistry.register({
            name: toolName,
            description: `[CUSTOM AGENT: ${agent.name}] ${agent.description}. Use this tool to delegate tasks specifically to this persona.`,
            schema: z.object({
                task: z.string().describe(`The detailed task instructions for ${agent.name}.`)
            }),
            execute: async (args) => {
                try {
                    const { Agent } = await import("./agent");
                    console.log(pc.magenta(`\n[Custom Agent: ${agent.name}] Delegating task: "${args.task}"`));
                    
                    // Creates a subagent instance. The 'true' flag means it's a subagent.
                    const subagent = new Agent(`.agent_${agent.id}_history.json`, 15, 10, true, "coder");
                    
                    // Construct a robust system prompt for the subagent
                    const fullPrompt = `${agent.systemPrompt}
You are a specialized subagent named ${agent.name}.
Complete this task: ${args.task}

IMPORTANT: When you are finished, you MUST call the "finish_task" tool to return your final answer.
You are ONLY allowed to use these tools: ${agent.allowedTools.join(', ')}. If you need something else, ask the Architect.`;

                    const finalAnswer = await subagent.runStep(fullPrompt);
                    
                    return { success: true, report: finalAnswer };
                } catch (e: any) {
                    return { success: false, error: `${agent.name} failed: ${e.message}` };
                }
            }
        });

        // Also add the tool to permissions dynamically
        const { grantPermission } = await import("./permissions");
        grantPermission(toolName);
    }
}
