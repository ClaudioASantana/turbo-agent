import { pipeline } from '@xenova/transformers';

async function main() {
  console.log("Loading embedding model...");
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log("Model loaded. Generating embedding...");
  const out = await extractor('This is a test document', { pooling: 'mean', normalize: true });
  console.log("Embedding generated:", Array.from(out.data).slice(0, 5));
}

main().catch(console.error);
