import { Router } from "express";
import multer from "multer";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { openai } from "../../llmClient";

export const transcribeRouter = Router();
const upload = multer({ dest: os.tmpdir() });

transcribeRouter.post("/", upload.single("audio"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No audio file provided" });
        }
        
        const originalName = req.file.originalname || "audio.webm";
        const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}_${originalName}`);
        
        fs.renameSync(req.file.path, tempFilePath);
        
        const response = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: "whisper-1",
        });
        
        fs.unlinkSync(tempFilePath);
        
        return res.json({ text: response.text });
    } catch (error: any) {
        console.error("Transcription error:", error);
        return res.status(500).json({ error: error.message });
    }
});
