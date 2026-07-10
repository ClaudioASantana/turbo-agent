import { Telegraf, Markup } from "telegraf";
import { Agent, agentEvents } from "./agent";
import { openai } from "./llmClient";
import axios from "axios";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function startTelegramBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.log("[Telegram] TELEGRAM_BOT_TOKEN not found in .env. Bot disabled.");
        return;
    }

    const bot = new Telegraf(token);
    const activeAgents: Map<number, Agent> = new Map();

    async function getOrCreateAgent(chatId: number): Promise<Agent> {
        if (!activeAgents.has(chatId)) {
            const threadId = `telegram_${chatId}`;
            const newAgent = new Agent(`.agent_history_${chatId}.json`, undefined, undefined, false, "generic", threadId);
            await newAgent.setupDatabase();
            
            newAgent.agentEvents.on("pause", () => {
                bot.telegram.sendMessage(
                    chatId, 
                    "⚠️ O Arquiteto propôs um plano. Deseja executar?",
                    Markup.inlineKeyboard([
                        Markup.button.callback("✅ Aprovar", "approve_plan"),
                        Markup.button.callback("❌ Abortar", "abort_plan")
                    ])
                );
            });
            activeAgents.set(chatId, newAgent);
        }
        return activeAgents.get(chatId)!;
    }


    bot.action("approve_plan", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) return;
        const agent = await getOrCreateAgent(chatId);

        await ctx.answerCbQuery("Plano aprovado!");
        await ctx.editMessageText("✅ Plano aprovado. Executando...");
        agent.agentEvents.emit("system", "✅ Plano Aprovado via Telegram. Retomando Coder...");
        
        try {
           const response = await agent.runStep(null);
           await ctx.reply(`🤖 Finalizado:\n${response}`);
        } catch (e: any) {
           await ctx.reply(`❌ Erro após aprovação: ${e.message}`);
        }
    });

    bot.action("abort_plan", async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) return;
        const agent = await getOrCreateAgent(chatId);

        await ctx.answerCbQuery("Plano abortado.");
        await ctx.editMessageText("❌ Plano abortado.");
        agent.agentEvents.emit("system", "❌ Plano Rejeitado via Telegram. Abortando operação...");
        await agent.abortPlan();
    });

    bot.on("text", async (ctx) => {
        const chatId = ctx.chat.id;
        const msg = ctx.message.text;
        const agent = await getOrCreateAgent(chatId);

        await ctx.reply("Raciocinando na sua máquina...");
        try {
            const finalAnswer = await agent.runStep(msg);
            
            // Se pausou por HITL, não envia "Finalizado" agora.
            if (typeof finalAnswer === 'object' && finalAnswer !== null && 'status' in finalAnswer && finalAnswer.status === 'paused') {
               return; // A mensagem com botões já foi enviada pelo evento 'pause'
            }
            
            await ctx.reply(`🤖 ${finalAnswer}`);
        } catch (e: any) {
            await ctx.reply(`❌ Erro: ${e.message}`);
        }
    });

    bot.on("voice", async (ctx) => {
        const chatId = ctx.chat.id;
        const agent = await getOrCreateAgent(chatId);
        
        const processingMsg = await ctx.reply("🎤 Baixando e transcrevendo áudio...");
        try {
            const fileId = ctx.message.voice.file_id;
            const link = await ctx.telegram.getFileLink(fileId);
            
            const response = await axios({
                url: link.href,
                method: 'GET',
                responseType: 'stream'
            });
            
            const tempFilePath = path.join(os.tmpdir(), `tg_audio_${Date.now()}.ogg`);
            const writer = fs.createWriteStream(tempFilePath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const OpenAIClass = require('openai').default || require('openai');
            const whisperClient = new OpenAIClass({
                apiKey: process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || "dummy",
            });
            whisperClient.baseURL = process.env.WHISPER_BASE_URL || "https://api.openai.com/v1";

            const transcription = await whisperClient.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: "whisper-1",
            });
            
            fs.unlinkSync(tempFilePath);

            await ctx.telegram.editMessageText(
                chatId,
                processingMsg.message_id,
                undefined,
                `🗣️ Você disse: "${transcription.text}"\n\nRaciocinando...`
            );
            
            const finalAnswer = await agent.runStep(transcription.text);
            
            if (typeof finalAnswer === 'object' && finalAnswer !== null && 'status' in finalAnswer && finalAnswer.status === 'paused') {
               return; 
            }

            await ctx.reply(`🤖 ${finalAnswer}`);

        } catch (e: any) {
            const errDetails = e.response?.data?.error?.message || e.message || String(e);
            await ctx.reply(`❌ Erro no áudio: ${errDetails}`);
        }
    });

    bot.catch((err, ctx) => {
        console.error(`[Telegram] Erro no bot para a atualização ${ctx.updateType}:`, err);
    });

    bot.launch().catch(err => {
        console.error("[Telegram] Falha crítica ao iniciar bot (rede/timeout):", err.message);
    });
    console.log("[Telegram] Bot iniciado e aguardando comandos!");

    process.once("SIGINT", () => bot.stop("SIGINT"));
    process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
