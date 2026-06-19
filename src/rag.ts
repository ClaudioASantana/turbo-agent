import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

// Import dinâmico ou estático do pipeline
let pipelineFunc: any = null;

async function getExtractor() {
  if (!pipelineFunc) {
    const transformers = await import('@xenova/transformers');
    pipelineFunc = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipelineFunc;
}

const INDEX_FILE = path.join(process.cwd(), '.agent_embeddings.json');

interface Chunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  embedding: number[];
}

function chunkText(text: string, filePath: string, chunkSize = 40, overlap = 10): Omit<Chunk, 'embedding'>[] {
  const lines = text.split('\n');
  const chunks: Omit<Chunk, 'embedding'>[] = [];
  
  for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
    const chunkLines = lines.slice(i, i + chunkSize);
    if (chunkLines.join('').trim() === '') continue; // Ignora chunks vazios
    chunks.push({
      file: filePath,
      startLine: i + 1,
      endLine: i + chunkLines.length,
      content: chunkLines.join('\n')
    });
  }
  return chunks;
}

function getFilesRecursively(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist' && file !== 'mcp') {
        getFilesRecursively(filePath, fileList);
      }
    } else {
      if (filePath.endsWith('.ts')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
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

export async function buildIndex() {
  console.log(pc.blue('\n[RAG] Iniciando indexação semântica do projeto... (Isso pode levar alguns segundos na primeira vez)'));
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error('Diretório src/ não encontrado.');
  }

  const files = getFilesRecursively(srcDir);
  const extractor = await getExtractor();
  const allChunks: Chunk[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rawChunks = chunkText(content, file.replace(process.cwd() + '/', ''));
    
    for (const chunk of rawChunks) {
      const out = await extractor(chunk.content, { pooling: 'mean', normalize: true });
      const embedding = Array.from(out.data) as number[];
      allChunks.push({ ...chunk, embedding });
    }
  }

  fs.writeFileSync(INDEX_FILE, JSON.stringify(allChunks));
  console.log(pc.green(`[RAG] Indexação concluída! ${allChunks.length} blocos mapeados.`));
}

export async function search(query: string, topK: number = 3): Promise<string> {
  if (!fs.existsSync(INDEX_FILE)) {
    console.log(pc.yellow('[RAG] Índice não encontrado. Criando agora...'));
    await buildIndex();
  }

  const chunks: Chunk[] = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  const extractor = await getExtractor();
  
  const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(queryOut.data) as number[];

  const scoredChunks = chunks.map(chunk => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));

  scoredChunks.sort((a, b) => b.score - a.score);
  const topChunks = scoredChunks.slice(0, topK);

  let resultString = `Busca Semântica por: "${query}"\n\n`;
  for (const chunk of topChunks) {
    resultString += `--- Arquivo: ${chunk.file} (Linhas ${chunk.startLine}-${chunk.endLine}) [Score: ${chunk.score.toFixed(2)}] ---\n`;
    resultString += `${chunk.content}\n\n`;
  }
  
  return resultString;
}
