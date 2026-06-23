"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HistoryManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const memory_1 = require("./memory");
const logger_1 = require("./logger");
const picocolors_1 = __importDefault(require("picocolors"));
const ora_1 = __importDefault(require("ora"));
const config_1 = require("./config");
const secretsDetector_1 = require("./secretsDetector");
class HistoryManager {
    historyFile;
    messages = [];
    maxMessages;
    constructor(historyFilePath, maxMessages) {
        this.historyFile = path.join(process.cwd(), historyFilePath);
        this.maxMessages = maxMessages;
    }
    resetMessages(systemPrompt) {
        this.messages = [
            { role: "system", content: systemPrompt }
        ];
    }
    loadHistory(systemPrompt) {
        if (fs.existsSync(this.historyFile)) {
            try {
                const data = fs.readFileSync(this.historyFile, "utf-8");
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    parsed[0] = { role: "system", content: systemPrompt };
                    this.messages = parsed;
                    logger_1.Logger.info(`Memória restaurada: ${this.messages.length} mensagens no contexto`);
                }
            }
            catch (e) {
                logger_1.Logger.error(`Erro ao carregar histórico: ${e.message}`);
            }
        }
        else {
            this.resetMessages(systemPrompt);
        }
    }
    saveHistory() {
        try {
            fs.writeFileSync(this.historyFile, JSON.stringify(this.messages, null, 2), "utf-8");
        }
        catch (e) {
            logger_1.Logger.error(`Erro ao salvar histórico: ${e.message}`);
        }
    }
    clearHistory(systemPrompt) {
        this.resetMessages(systemPrompt);
        this.saveHistory();
        logger_1.Logger.info("Memória apagada com sucesso");
    }
    addMessage(role, content) {
        let safeContent = content;
        if (typeof content === "string") {
            safeContent = (0, secretsDetector_1.redactSecretsInText)(content);
        }
        else if (Array.isArray(content)) {
            safeContent = content.map((item) => {
                if (item && item.type === "text" && typeof item.text === "string") {
                    return { ...item, text: (0, secretsDetector_1.redactSecretsInText)(item.text) };
                }
                return item;
            });
        }
        this.messages.push({ role, content: safeContent });
        this.saveHistory();
    }
    updateSystemPrompt(systemPrompt) {
        if (this.messages.length > 0 && this.messages[0].role === "system") {
            this.messages[0].content = systemPrompt;
        }
    }
    async compactMemoryIfNecessary() {
        const isJson = (0, config_1.getConfig)().logFormat === 'json';
        if (this.messages.length > this.maxMessages) {
            const spinnerMem = isJson ? null : (0, ora_1.default)(picocolors_1.default.blue("Compactando memória antiga...")).start();
            if (isJson)
                logger_1.Logger.info("Compactando memória antiga...");
            try {
                const numToSummarize = Math.floor(this.maxMessages / 2);
                const messagesToSummarize = this.messages.slice(2, numToSummarize + 2);
                const summary = await (0, memory_1.summarizeMessages)(messagesToSummarize);
                this.messages = [
                    this.messages[0], // System prompt
                    this.messages[1], // O Pedido Original do Usuário blindado
                    { role: "assistant", content: `[Resumo do Histórico Anterior]:\n${summary}` },
                    ...this.messages.slice(numToSummarize + 2) // Mantém a metade mais recente intacta
                ];
                if (spinnerMem)
                    spinnerMem.succeed(picocolors_1.default.green("Memória compactada com sucesso!"));
                else
                    logger_1.Logger.info("Memória compactada com sucesso!");
                this.saveHistory();
            }
            catch (err) {
                if (spinnerMem)
                    spinnerMem.fail(picocolors_1.default.red(`Erro ao compactar memória: ${err.message}`));
                else
                    logger_1.Logger.error(`Erro ao compactar memória: ${err.message}`);
                // Fallback para o slice ingênuo
                this.messages = [
                    this.messages[0],
                    ...this.messages.slice(-(this.maxMessages - 1))
                ];
                this.saveHistory();
            }
        }
    }
}
exports.HistoryManager = HistoryManager;
