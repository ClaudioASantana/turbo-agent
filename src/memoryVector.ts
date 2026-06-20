import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

let pipelineFunc: any = null;

async function getExtractor() {
  if (!pipelineFunc) {
    const transformers = await import('@xenova/transformers');
    pipelineFunc = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipelineFunc;
}

const MEMORY_FILE = path.join(process.cwd(), '.agent_memory.json');

interface MemoryEntry {
  id: string;
  timestamp: string;
  content: string;
  embedding: number[];
}

function loadMemory(): MemoryEntry[] {
  if (!fs.existsSync(MEMORY_FILE)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  } catch (e) {
    console.error(pc.yellow(`[Memória] Falha ao ler arquivo de memória. Criando um novo.`));
    return [];
  }
}

function saveMemory(entries: MemoryEntry[]) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function remember(content: string): Promise<void> {
  const extractor = await getExtractor();
  const out = await extractor(content, { pooling: 'mean', normalize: true });
  const embedding = Array.from(out.data) as number[];

  const entries = loadMemory();
  entries.push({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    content,
    embedding
  });
  
  saveMemory(entries);
  console.log(pc.green(`\n[Memória] Novo conhecimento salvo: "${content.substring(0, 50)}..."`));
}

export async function recall(query: string, topK: number = 2, threshold: number = 0.3): Promise<string[]> {
  const entries = loadMemory();
  if (entries.length === 0) return [];

  try {
      const extractor = await getExtractor();
      const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
      const queryEmbedding = Array.from(queryOut.data) as number[];

      const scored = entries.map(entry => ({
        ...entry,
        score: cosineSimilarity(queryEmbedding, entry.embedding)
      }));

      // Filter by threshold and sort descending
      const relevant = scored.filter(e => e.score >= threshold).sort((a, b) => b.score - a.score);
      const topEntries = relevant.slice(0, topK);

      return topEntries.map(e => e.content);
  } catch(e: any) {
      console.log(pc.yellow(`[Memória] Erro ao consultar RAG de memória: ${e.message}`));
      return [];
  }
}
