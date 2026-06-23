"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIndex = buildIndex;
exports.search = search;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const picocolors_1 = __importDefault(require("picocolors"));
// Import dinâmico ou estático do pipeline
let pipelineFunc = null;
async function getExtractor() {
    if (!pipelineFunc) {
        const transformers = await Promise.resolve().then(() => __importStar(require('@xenova/transformers')));
        pipelineFunc = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return pipelineFunc;
}
const INDEX_FILE = path_1.default.join(process.cwd(), '.agent_embeddings.json');
function chunkText(text, filePath, chunkSize = 40, overlap = 10) {
    const lines = text.split('\n');
    const chunks = [];
    for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
        const chunkLines = lines.slice(i, i + chunkSize);
        if (chunkLines.join('').trim() === '')
            continue; // Ignora chunks vazios
        chunks.push({
            file: filePath,
            startLine: i + 1,
            endLine: i + chunkLines.length,
            content: chunkLines.join('\n')
        });
    }
    return chunks;
}
function getFilesRecursively(dir, fileList = []) {
    const files = fs_1.default.readdirSync(dir);
    for (const file of files) {
        const filePath = path_1.default.join(dir, file);
        if (fs_1.default.statSync(filePath).isDirectory()) {
            if (file !== 'node_modules' && file !== 'dist' && file !== 'mcp') {
                getFilesRecursively(filePath, fileList);
            }
        }
        else {
            if (filePath.endsWith('.ts')) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0)
        return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
async function buildIndex() {
    console.log(picocolors_1.default.blue('\n[RAG] Iniciando indexação semântica do projeto... (Isso pode levar alguns segundos na primeira vez)'));
    const srcDir = path_1.default.join(process.cwd(), 'src');
    if (!fs_1.default.existsSync(srcDir)) {
        throw new Error('Diretório src/ não encontrado.');
    }
    const files = getFilesRecursively(srcDir);
    const extractor = await getExtractor();
    const allChunks = [];
    for (const file of files) {
        const content = fs_1.default.readFileSync(file, 'utf-8');
        const rawChunks = chunkText(content, file.replace(process.cwd() + '/', ''));
        for (const chunk of rawChunks) {
            const out = await extractor(chunk.content, { pooling: 'mean', normalize: true });
            const embedding = Array.from(out.data);
            allChunks.push({ ...chunk, embedding });
        }
    }
    fs_1.default.writeFileSync(INDEX_FILE, JSON.stringify(allChunks));
    console.log(picocolors_1.default.green(`[RAG] Indexação concluída! ${allChunks.length} blocos mapeados.`));
}
async function search(query, topK = 3) {
    if (!fs_1.default.existsSync(INDEX_FILE)) {
        console.log(picocolors_1.default.yellow('[RAG] Índice não encontrado. Criando agora...'));
        await buildIndex();
    }
    const chunks = JSON.parse(fs_1.default.readFileSync(INDEX_FILE, 'utf-8'));
    const extractor = await getExtractor();
    const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(queryOut.data);
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
