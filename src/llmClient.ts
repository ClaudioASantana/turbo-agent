import OpenAI from "openai";
import "dotenv/config";

export let openai: OpenAI;

export function initLLM(baseURL?: string, apiKey?: string) {
  openai = new OpenAI({
    baseURL: baseURL || process.env.LLM_BASE_URL || "http://172.24.160.1:18080/v1",
    apiKey: apiKey || process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "llama.cpp",
  });
}

