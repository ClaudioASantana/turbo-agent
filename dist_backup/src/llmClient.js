"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openai = void 0;
exports.initLLM = initLLM;
const openai_1 = __importDefault(require("openai"));
require("dotenv/config");
function initLLM(baseURL, apiKey) {
    // Se temos a chave da OpenAI explícita e nenhuma Base URL foi passada/forçada,
    // nós devemos usar a API oficial da OpenAI (baseURL undefined) para evitar timeout no IP local.
    const isEnvOpenAI = !baseURL && !process.env.LLM_BASE_URL && process.env.OPENAI_API_KEY;
    exports.openai = new openai_1.default({
        baseURL: isEnvOpenAI ? undefined : (baseURL || process.env.LLM_BASE_URL || "http://172.24.160.1:18080/v1"),
        apiKey: apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "llama.cpp",
    });
}
