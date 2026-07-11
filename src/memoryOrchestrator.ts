import { recall, remember } from "./memoryVector";
import { CoreMemory } from "./coreMemory";
import { getMemoryManager } from "./memoryMetadata";
import { summarizeMessages } from "./memory";
import { Logger } from "./logger";

export class CognitiveMemorySystem {
    /**
     * Recupera o contexto global mesclando 3 camadas de memória:
     * 1. Semântica (Fatos vetorizados baseados na query do usuário)
     * 2. Procedural (Regras e core memories do agente)
     * 3. Episódica (Histórico de sucesso recente)
     */
    public static async retrieveGlobalContext(query: string): Promise<string> {
        Logger.info("[MemoryOrchestrator] Buscando contexto global...");
        let contextParts: string[] = [];

        // 1. Memória Semântica (Vector RAG)
        try {
            const semanticFacts = await recall(query, 3, 0.25);
            if (semanticFacts && semanticFacts.length > 0) {
                contextParts.push(`--- FATOS SEMÂNTICOS PASSADOS ---\n- ${semanticFacts.join("\n- ")}`);
            }
        } catch (e: any) {
            Logger.warn(`Erro ao buscar memória semântica: ${e.message}`);
        }

        // 2. Memória Procedural (Core Rules)
        const rules = CoreMemory.getRules();
        if (rules && rules.length > 0) {
            contextParts.push(`--- REGRAS DE COMPORTAMENTO (PROCEDURAL) ---\n- ${rules.join("\n- ")}`);
        }

        // 3. Memória Episódica (Lições de sucesso)
        const memoryManager = getMemoryManager();
        const successfulEpisodes = memoryManager.getMemoriesByStatus(true, 3);
        if (successfulEpisodes && successfulEpisodes.length > 0) {
            const episodesCtx = successfulEpisodes.map(ep => 
                `[${ep.timestamp}] Tarefa: ${ep.content}\nArquivos afetados: ${ep.metadata.filesModified.join(', ')}`
            );
            contextParts.push(`--- EPISÓDIOS RECENTES DE SUCESSO ---\n${episodesCtx.join("\n\n")}`);
        }

        return contextParts.join("\n\n");
    }

    /**
     * Consolida a Working Memory (messages) em memórias de longo prazo.
     * Roda em background sem bloquear a thread principal.
     */
    public static consolidateEpisode(
        messages: any[], 
        metadata: any
    ): void {
        Logger.info("[MemoryOrchestrator] Iniciando consolidação da memória em background...");
        
        // Dispara de forma assíncrona (fogo e esquece)
        setTimeout(async () => {
            try {
                // 1. Resume as mensagens usando LLM
                const summary = await summarizeMessages(messages);
                
                // 2. Salva na Memória Semântica (Embeddings)
                await remember(summary);

                // 3. Salva na Memória Episódica (Metadados Estruturados)
                const manager = getMemoryManager();
                manager.addMemory(summary, metadata);

                Logger.info("[MemoryOrchestrator] Consolidação da memória concluída com sucesso.");
            } catch (error: any) {
                Logger.error(`[MemoryOrchestrator] Falha ao consolidar episódio: ${error.message}`);
            }
        }, 0);
    }
}
