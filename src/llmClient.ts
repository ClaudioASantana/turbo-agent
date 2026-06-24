import OpenAI from "openai";
import "dotenv/config";

export let openai: OpenAI;

export function initLLM(baseURL?: string, apiKey?: string) {
  // Se temos a chave da OpenAI explícita e nenhuma Base URL foi passada/forçada,
  // nós devemos usar a API oficial da OpenAI (baseURL undefined) para evitar timeout no IP local.
  const isEnvOpenAI = !baseURL && !process.env.LLM_BASE_URL && process.env.OPENAI_API_KEY;

  openai = new OpenAI({
    baseURL: isEnvOpenAI ? undefined : (baseURL || process.env.LLM_BASE_URL || "http://172.24.160.1:18080/v1"),
    apiKey: apiKey || process.env.OPENAI_API_KEY || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "llama.cpp",
  });
}

