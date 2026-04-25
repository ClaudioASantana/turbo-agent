import OpenAI from "openai";

// Initialize OpenAI client pointing to local Ollama
export const openai = new OpenAI({
  baseURL: "http://localhost:8081/v1",
  apiKey: "llama.cpp", // API key is required by the SDK but ignored by llama.cpp
});
