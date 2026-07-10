import { Router } from "express";
import { loadCustomAgents, saveCustomAgents, registerCustomAgents } from "../../customAgents";

export const agentsRouter = Router();

agentsRouter.get("/", (req, res) => {
    res.json(loadCustomAgents());
});

agentsRouter.post("/", async (req, res) => {
    const agents = loadCustomAgents();
    const newAgent = req.body;
    if (!newAgent.id) newAgent.id = Date.now().toString();
    
    // update or push
    const idx = agents.findIndex(a => a.id === newAgent.id);
    if (idx >= 0) agents[idx] = newAgent;
    else agents.push(newAgent);
    
    saveCustomAgents(agents);
    await registerCustomAgents(); // Dynamically re-register tools!
    res.json({ status: "success", agent: newAgent });
});

agentsRouter.delete("/:id", (req, res) => {
    let agents = loadCustomAgents();
    agents = agents.filter(a => a.id !== req.params.id);
    saveCustomAgents(agents);
    
    // Note: Re-registering doesn't automatically remove deleted tools from the registry 
    // without a registry reset, but it's acceptable for this MVP to just restart to fully drop.
    res.json({ status: "success" });
});
