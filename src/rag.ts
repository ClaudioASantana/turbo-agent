import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { LocalIndex } from 'vectra';

// Import dinâmico ou estático do pipeline
let pipelineFunc: any = null;

async function getExtractor() {
  if (!pipelineFunc) {
    const transformers = await import('@xenova/transformers');
    pipelineFunc = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return pipelineFunc;
}

const INDEX_FOLDER = path.join(process.cwd(), '.agent_vectra_db');
const index = new LocalIndex(INDEX_FOLDER);

interface Chunk {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
}

function chunkText(text: string, filePath: string, chunkSize = 40, overlap = 10): Chunk[] {
  const lines = text.split('\n');
  const chunks: Chunk[] = [];
  
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
      if (file !== 'node_modules' && file !== 'dist' && file !== 'mcp' && !file.startsWith('.')) {
        getFilesRecursively(filePath, fileList);
      }
    } else {
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.js')) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

export async function buildIndex() {
  console.log(pc.blue('\n[RAG] Iniciando indexação semântica otimizada com Vectra... (Isto ocorre apenas se o índice não existir)'));
  const srcDir = path.join(process.cwd(), 'src');
  if (!fs.existsSync(srcDir)) {
    throw new Error('Diretório src/ não encontrado.');
  }

  if (!await index.isIndexCreated()) {
    await index.createIndex();
  }

  const files = getFilesRecursively(srcDir);
  const extractor = await getExtractor();

  await index.beginUpdate();

  let count = 0;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rawChunks = chunkText(content, file.replace(process.cwd() + '/', ''));
    
    for (const chunk of rawChunks) {
      const out = await extractor(chunk.content, { pooling: 'mean', normalize: true });
      const embedding = Array.from(out.data) as number[];
      
      await index.upsertItem({
         id: `${chunk.file}-${chunk.startLine}`,
         vector: embedding,
         metadata: {
            file: chunk.file,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content
         }
      });
      count++;
    }
  }

  await index.endUpdate();
  console.log(pc.green(`[RAG] Indexação Vectra concluída! ${count} blocos mapeados e otimizados.`));
}

export async function search(query: string, topK: number = 3): Promise<string> {
  if (!await index.isIndexCreated()) {
    console.log(pc.yellow('[RAG] Índice Vectra não encontrado. Criando agora...'));
    await buildIndex();
  }

  const extractor = await getExtractor();
  
  const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(queryOut.data) as number[];

  // Realiza a busca super rápida no índice do Vectra
  const results = await index.queryItems(queryEmbedding, query, topK);

  let resultString = `Busca Semântica por: "${query}"\n\n`;
  for (const result of results) {
    const meta: any = result.item.metadata;
    resultString += `--- Arquivo: ${meta.file} (Linhas ${meta.startLine}-${meta.endLine}) [Score: ${result.score.toFixed(2)}] ---\n`;
    resultString += `${meta.content}\n\n`;
  }
  
  return resultString;
}
