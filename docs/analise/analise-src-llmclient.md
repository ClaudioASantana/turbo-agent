# Análise de `src/llmClient.ts`

## Visão geral
`src/llmClient.ts` é o bootstrap do cliente OpenAI usado pelo Turbo-Agent. Ele decide qual base URL e qual chave de API serão usadas para falar com o modelo.

## Bloco 1 — Imports e estado global
- Importa `OpenAI`.
- Carrega variáveis de ambiente via `dotenv/config`.
- Expõe `openai` como variável global inicializada depois.

**Responsabilidade:** fornecer um cliente reutilizável para o restante da aplicação.

## Bloco 2 — `initLLM()`
- Recebe `baseURL` e `apiKey` opcionais.
- Detecta quando deve usar a API oficial da OpenAI.
- Se não estiver nesse modo, escolhe base URL nesta ordem:
  1. argumento `baseURL`
  2. `process.env.LLM_BASE_URL`
  3. fallback fixo `http://172.24.160.1:18080/v1`
- A chave segue esta ordem:
  1. argumento `apiKey`
  2. `OPENAI_API_KEY`
  3. `LLM_API_KEY`
  4. `OPENROUTER_API_KEY`
  5. fallback literal `llama.cpp`

**Responsabilidade:** resolver o provedor de LLM e sua autenticação.

## Onde está a complexidade
- A seleção de provedor depende de combinação de argumentos e variáveis de ambiente.
- Há um fallback de base URL hardcoded.
- A lógica é pequena, mas muito central: qualquer erro aqui afeta CLI, servidor e agentes.

## Sinais de risco
- O fallback para `http://172.24.160.1:18080/v1` é rígido e pode quebrar fora do ambiente esperado.
- O uso de `llama.cpp` como apiKey default é um placeholder estranho; funciona como fallback, mas pode mascarar configuração ausente.
- A decisão entre OpenAI oficial e base local é implícita demais para um componente tão crítico.

## Leitura prática
Esse arquivo é simples, mas é um ponto de configuração sensível. Vale mantê-lo pequeno e bem previsível.

## Resumo em uma frase
`src/llmClient.ts` centraliza a escolha do provedor LLM, mas usa defaults que denunciam forte acoplamento ao ambiente local.
