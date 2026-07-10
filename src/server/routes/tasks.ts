import { Router } from "express";
import { backgroundProcesses } from "../../tools";

export const tasksRouter = Router();

tasksRouter.get("/", (req, res) => {
    const tasks = Object.keys(backgroundProcesses).map(id => ({
        id,
        command: backgroundProcesses[id].command,
        status: backgroundProcesses[id].status
    }));
    return res.json({ tasks });
});

tasksRouter.get("/:id/logs", (req, res) => {
    const { id } = req.params;
    const proc = backgroundProcesses[id];
    if (!proc) return res.status(404).json({ error: "Task not found" });
    return res.json({ logs: proc.logs });
});

tasksRouter.delete("/:id", (req, res) => {
    const { id } = req.params;
    const proc = backgroundProcesses[id];
    if (!proc) return res.status(404).json({ error: "Task not found" });
    if (proc.status === "running") {
        proc.process.kill();
        proc.status = "killed";
    }
    delete backgroundProcesses[id];
    return res.json({ status: "deleted" });
});
