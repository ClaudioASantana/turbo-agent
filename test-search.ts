import { search } from './src/rag';

async function main() {
  const res = await search("Onde inicializamos o OpenAI?");
  console.log(res);
}

main().catch(console.error);
