# Fase 2: Item 2 - Visão Computacional (Navegador Autônomo)

O seu agente agora tem olhos! Com a instalação do `Playwright`, nós construímos a arquitetura Multimodal no seu `turbo-agent`.

## O que foi alterado?

1. **Ferramenta `capture_screenshot`:**
   - Adicionada ao `src/tools.ts`. O agente agora pode invocar um navegador invisível no background usando o motor do Chromium, navegar para qualquer URL pública ou local (ex: `http://localhost:3000`), renderizar a página completa e capturar uma imagem limpa da tela.

2. **Payload Vision Multimodal (`agent.ts`):**
   - Antes, o agente apenas "convertia pra texto" os retornos das ferramentas. Agora, quando a ferramenta devolve uma `image_url` (em Base64), ele formata a mensagem para a API de Visão da OpenAI. Ele envia a matriz de pixels diretamente para as redes neurais do LLM, permitindo que o LLM enxergue a interface gráfica de verdade.

3. **Memória Inteligente e Econômica (`memory.ts`):**
   - Enviar imagens na API é barato, mas *guardá-las* no histórico de texto iria explodir os tokens e quebrar o compactador de memória.
   - Nós adaptamos o resumidor de contexto para interceptar os buffers de imagem. Na hora de gerar o resumo do passado, o agente substitui as imagens gigantescas pela simples tag `[IMAGEM CAPTURADA PELO NAVEGADOR]`. Assim ele sabe que ele viu algo ali atrás, mas o seu custo com tokens continua zerado!

## Como Testar?

Rodando `npx tsx src/index.ts`, envie a seguinte instrução:
> *"Agente, entre no site do `github.com` usando a ferramenta de screenshot e me descreva detalhadamente como está o visual da página no momento."*

**O que vai acontecer:**
Ele vai chamar a nova ferramenta, o Playwright vai baixar a página em memória e o agente vai relatar pra você a cor do site, as seções visíveis e o posicionamento dos elementos!
