import OpenAI from "openai";
import { ChatOpenAI } from "@langchain/openai";
import "dotenv/config";

export let openai: OpenAI;

export function initLLM(baseURL?: string, apiKey?: string) {
  // Se temos a chave da OpenAI explícita e nenhuma Base URL foi passada/forçada,
  // nós devemos usar a API oficial da OpenAI (baseURL undefined) para evitar timeout no IP local.
  const isEnvOpenAI = !baseURL && !process.env.LLM_BASE_URL && process.env.OPENAI_API_KEY;

  openai = new OpenAI({
    baseURL: isEnvOpenAI ? undefined : (baseURL || process.env.LLM_BASE_URL || undefined),
    apiKey: apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "llama.cpp",
  });
}

export interface ChatModelOptions {
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}

export function getChatModel(options: ChatModelOptions = {}, tools?: any[]) {
  const primaryModel = new ChatOpenAI({
    modelName: options.modelName || process.env.LLM_MODEL || "qwen-35b-turboquant",
    temperature: options.temperature ?? (process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2),
    maxTokens: options.maxTokens ?? (process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192),
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
    streamUsage: false,
    maxRetries: 3,
    streaming: options.streaming || false,
    configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
  });

  const modelWithTools = tools ? primaryModel.bindTools(tools) : primaryModel;

  const fallbackModelName = process.env.FALLBACK_LLM_MODEL;
  if (fallbackModelName) {
    const fallbackModel = new ChatOpenAI({
      modelName: fallbackModelName,
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 8192,
      apiKey: process.env.FALLBACK_LLM_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
      streamUsage: false,
      maxRetries: 1, // Menos retentativas no fallback
      streaming: options.streaming || false,
      configuration: { baseURL: process.env.FALLBACK_LLM_BASE_URL || process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
    });
    
    const fallbackWithTools = tools ? fallbackModel.bindTools(tools) : fallbackModel;
    // @ts-ignore
    return modelWithTools.withFallbacks({ fallbacks: [fallbackWithTools] });
  }

  return modelWithTools;
}

