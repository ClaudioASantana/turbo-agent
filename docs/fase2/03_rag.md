# Fase 2: Item 3 - Busca Semântica (RAG Local) 🧠

O cérebro do seu agente acabou de ser expandido com um motor de vetorização local (RAG) construído puramente em TypeScript. A limitação da "Janela de Contexto" de tokens de leitura de código foi virtualmente eliminada.

## O que foi alterado?

1. **Inteligência Artificial Nativa do V8:**
   - Para não colocar dependências de Python ou containers de Docker na sua máquina, nós instalamos a `@xenova/transformers`. Essa biblioteca traz a rede neural de embeddings `all-MiniLM-L6-v2` diretamente para o Node.js via WebAssembly. Ela gera vetores instantâneos rodando na CPU/Memória local sem custar 1 centavo da sua API da OpenAI/Claude.

2. **Criação do Indexador Vetorial (`src/rag.ts`):**
   - Criamos a função `buildIndex()`: ela fatia todo o código da sua pasta `src/` em dezenas de pequenos chunks, converte eles em representação matemática (Arrays de Embeddings) e guarda escondidinho num arquivo `.agent_embeddings.json`.
   - Criamos a função `search(query)`: ela transforma a sua pergunta em um vetor, usa a fórmula matemática da similaridade de cosseno (Cosine Similarity) para parear a sua pergunta com o trecho de código mais idêntico.

3. **Ferramenta `semantic_search` (`src/tools.ts`):**
   - Agora o agente pode acionar essa ferramenta passando o que ele quiser saber. Se for a primeira vez que ele usar a ferramenta no dia, ela auto-construirá os chunks antes de buscar.

## Como Testar?

No terminal (usando `npx tsx src/index.ts`), jogue o seguinte desafio para o LLM:
> *"Agente, não leia nenhum arquivo usando `read_file`! Use apenas a `semantic_search` para responder: Onde inicializamos o OpenAI? Me diga o nome do arquivo, a linha e o trecho de código exato."*

**O que vai acontecer:**
Ele vai carregar o modelo neural invisível na RAM, fatiar o código, comparar, e devolver o trecho exato (`src/llmClient.ts`) com a pontuação matemática da precisão! Tudo num piscar de olhos.
