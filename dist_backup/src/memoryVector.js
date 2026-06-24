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
exports.remember = remember;
exports.recall = recall;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const picocolors_1 = __importDefault(require("picocolors"));
let pipelineFunc = null;
async function getExtractor() {
    if (!pipelineFunc) {
        const transformers = await Promise.resolve().then(() => __importStar(require('@xenova/transformers')));
        pipelineFunc = await transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    return pipelineFunc;
}
const MEMORY_FILE = path_1.default.join(process.cwd(), '.agent_memory.json');
function loadMemory() {
    if (!fs_1.default.existsSync(MEMORY_FILE)) {
        return [];
    }
    try {
        return JSON.parse(fs_1.default.readFileSync(MEMORY_FILE, 'utf-8'));
    }
    catch (e) {
        console.error(picocolors_1.default.yellow(`[Memória] Falha ao ler arquivo de memória. Criando um novo.`));
        return [];
    }
}
function saveMemory(entries) {
    fs_1.default.writeFileSync(MEMORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
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
async function remember(content) {
    const extractor = await getExtractor();
    const out = await extractor(content, { pooling: 'mean', normalize: true });
    const embedding = Array.from(out.data);
    const entries = loadMemory();
    entries.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        content,
        embedding
    });
    saveMemory(entries);
    console.log(picocolors_1.default.green(`\n[Memória] Novo conhecimento salvo: "${content.substring(0, 50)}..."`));
}
async function recall(query, topK = 2, threshold = 0.3) {
    const entries = loadMemory();
    if (entries.length === 0)
        return [];
    try {
        const extractor = await getExtractor();
        const queryOut = await extractor(query, { pooling: 'mean', normalize: true });
        const queryEmbedding = Array.from(queryOut.data);
        const scored = entries.map(entry => ({
            ...entry,
            score: cosineSimilarity(queryEmbedding, entry.embedding)
        }));
        // Filter by threshold and sort descending
        const relevant = scored.filter(e => e.score >= threshold).sort((a, b) => b.score - a.score);
        const topEntries = relevant.slice(0, topK);
        return topEntries.map(e => e.content);
    }
    catch (e) {
        console.log(picocolors_1.default.yellow(`[Memória] Erro ao consultar RAG de memória: ${e.message}`));
        return [];
    }
}
