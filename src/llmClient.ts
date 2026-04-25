import OpenAI from "openai";
import "dotenv/config";

// Initialize OpenAI client using environment variables
export const openai = new OpenAI({
  baseURL: process.env.LLM_BASE_URL || "http://localhost:8081/v1",
  apiKey: process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY || "llama.cpp",
});

