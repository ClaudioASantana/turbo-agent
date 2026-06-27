import { Router } from "express";
import { readAuditLog, getAuditStats } from "../../audit";

export const auditRouter = Router();

auditRouter.get("/", async (req, res) => {
    try {
        const logs = await readAuditLog(200);
        const stats = await getAuditStats();
        return res.json({ logs, stats });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});
