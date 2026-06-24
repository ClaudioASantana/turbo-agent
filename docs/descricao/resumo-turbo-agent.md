# Resumo do Turbo Agent

🤖 Este projeto NÃO é um CRM WhatsApp
É um Agente de IA Autônomo local — o turbo-agent / omni-agent.

## O que ele faz?
* Recebe comandos em linguagem natural
* Raciocina com LLM (Ollama local, OpenAI, Claude, etc.)
* Executa ferramentas reais: lê/escreve arquivos, roda comandos no terminal, navega na web, automatiza browser
* Tem memória persistente entre sessões (SQLite + JSON)
* Tem UI web (React + Vite) e modo CLI

## Stack principal
* TypeScript + Node.js no backend
* LangGraph para orquestração do agente
* Express + SSE para streaming da UI
* Playwright para automação de browser
* @xenova/transformers para RAG local com embeddings
* MCP (Model Context Protocol) para integração com ferramentas externas

## Modos de uso
* `npm start` → CLI interativo com seleção de modelo
* `npm run studio` → Backend + UI React juntos
* `turbo-agent` → executável global
