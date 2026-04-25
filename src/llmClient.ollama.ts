import OpenAI from "openai";

// Initialize OpenAI client pointing to local Ollama
// We use the standard Ollama endpoint for OpenAI compatibility
export const openai = new OpenAI({
  baseURL: "http://localhost:11434/v1",
  apiKey: "ollama", // API key is required by the SDK but ignored by Ollama
});
