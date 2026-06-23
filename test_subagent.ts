import { registerCustomAgents, loadCustomAgents } from "./src/customAgents";
import { ToolRegistry } from "./src/tools";

async function run() {
    await registerCustomAgents();
    const result = await ToolRegistry.execute("invoke_Poeta_Sertanejo", { task: "Explique o que é TypeScript." });
    console.log("RESULT:", result);
}
run().catch(console.error);
