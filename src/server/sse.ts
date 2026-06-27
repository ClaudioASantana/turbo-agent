import { Router } from "express";
import { agentEvents } from "./agentInstance";

export const streamRouter = Router();

streamRouter.get("/", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onToken = (text: string) => {
        res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`);
    };

    const onSystem = (text: string) => {
        res.write(`data: ${JSON.stringify({ type: 'system', text })}\n\n`);
    };

    const onToolStart = (toolName: string) => {
        res.write(`data: ${JSON.stringify({ type: 'tool_start', toolName })}\n\n`);
    };

    const onOpenArtifact = (filePath: string) => {
        res.write(`data: ${JSON.stringify({ type: 'open_artifact', filePath })}\n\n`);
    };

    const onOpenDiff = (data: { originalPath: string, proposedPath: string }) => {
        res.write(`data: ${JSON.stringify({ type: 'open_diff', ...data })}\n\n`);
    };

    const onToolEnd = () => {
        res.write(`data: ${JSON.stringify({ type: 'tool_end' })}\n\n`);
    };

    const onPause = () => {
        res.write(`data: ${JSON.stringify({ type: 'pause' })}\n\n`);
    };

    const onError = (error: string) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
    };

    const onEnd = () => {
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    };

    agentEvents.on("token", onToken);
    agentEvents.on("system", onSystem);
    agentEvents.on("open_artifact", onOpenArtifact);
    agentEvents.on("open_diff", onOpenDiff);
    agentEvents.on("tool_start", onToolStart);
    agentEvents.on("tool_end", onToolEnd);
    agentEvents.on("pause", onPause);
    agentEvents.on("error", onError);
    agentEvents.on("end", onEnd);

    req.on("close", () => {
        agentEvents.off("token", onToken);
        agentEvents.off("system", onSystem);
        agentEvents.off("open_artifact", onOpenArtifact);
        agentEvents.off("open_diff", onOpenDiff);
        agentEvents.off("tool_start", onToolStart);
        agentEvents.off("tool_end", onToolEnd);
        agentEvents.off("pause", onPause);
        agentEvents.off("error", onError);
        agentEvents.off("end", onEnd);
    });
});
