# Análise de `src/llmClient.ts`

> Atualizado em: 26/06/2026 — Baseado na leitura direta do código-fonte atual.

## Visão geral

`src/llmClient.ts` é o bootstrap do cliente OpenAI usado pelo Turbo-Agent. Ele decide qual base URL e qual chave de API serão usadas para falar com o modelo.

## Responsabilidades

### 1. Inicialização do cliente
- Importa `OpenAI` e carrega variáveis de ambiente via `dotenv/config`.
- Expõe `openai` como variável global inicializada depois.

### 2. Função `initLLM(baseURL?, apiKey?)`
- Decide se deve usar a API oficial da OpenAI (quando `OPENAI_API_KEY` está definida sem `LLM_BASE_URL`).
- Determina a `baseURL` na ordem:
  1. argumento `baseURL`
  2. `process.env.LLM_BASE_URL`
  3. `undefined` (usa API oficial da OpenAI)
- Determina a `apiKey` na ordem:
  1. argumento `apiKey`
  2. `process.env.OPENAI_API_KEY`
  3. `process.env.LLM_API_KEY`
  4. `process.env.OPENROUTER_API_KEY`
  5. `"llama.cpp"` (placeholder para modelos locais)

## Onde está a complexidade

A lógica de escolha do provedor depende de combinações de argumentos e variáveis de ambiente. No entanto, a implementação atual já evoluiu:

- **Não há mais IP fixo hardcoded em produção** — o fallback agora é `undefined`, o que força o uso da API oficial quando disponível.
- O placeholder `"llama.cpp"` funciona como fallback final para modelos locais.

## Sinais de risco

- Ainda há uma certa complexidade na lógica de fallback, o que pode confundir em ambientes híbridos.
- Em ambientes de teste, o IP `127.0.0.1:2099/v1` ainda aparece em arquivos como `tests-scratch/`.

## Leitura prática

Arquivo enxuto e bem simples. A evolução recente tornou a lógica mais explícita e compatível com diferentes provedores.

## Resumo em uma frase

`src/llmClient.ts` centraliza a escolha do provedor LLM de forma clara e flexível, com suporte a OpenAI, OpenRouter e modelos locais.

