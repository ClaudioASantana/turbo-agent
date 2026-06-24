# OpenHands: Integração e Inspirações para o Turbo-Agent

Este documento explora a relação entre o nosso ecossistema local e o **OpenHands** (anteriormente OpenDevin). Abordaremos duas frentes:
1. Como rodar o OpenHands externamente usando nossa infraestrutura (Manifest).
2. Quais recursos do OpenHands devemos nos inspirar para implementar nativamente no `turbo-agent`.

---

## 1. Integração Externa: OpenHands consumindo o Manifest

Nosso projeto possui um Proxy local que simula a API da OpenAI. Isso significa que podemos levantar ferramentas de terceiros sem precisar fornecer chaves diretas da Anthropic/OpenAI, passando tudo pelo nosso Proxy/Manifest.

### Como rodar o OpenHands via Docker apontando para o Manifest:

Crie um arquivo `run_openhands.sh` na raiz com o seguinte conteúdo:

```bash
#!/bin/bash

# Diretório que o OpenHands terá acesso
export WORKSPACE_BASE=$(pwd)/workspace
mkdir -p $WORKSPACE_BASE

# Configurações do LiteLLM embutidas no OpenHands para apontar para nosso Proxy
docker run -it --pull=always \
    -e WORKSPACE_BASE=$WORKSPACE_BASE \
    -e LLM_API_KEY="mnfst_fY7SnPpnYLiuS4IUIs2FVszbr8o_FgdL0i42JyozAgE" \
    -e LLM_BASE_URL="http://host.docker.internal:2099/v1" \
    -e LLM_MODEL="openai/claude-3-5-sonnet-20241022" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -p 3000:3000 \
    --add-host host.docker.internal:host-gateway \
    docker.all-hands.dev/all-hands-ai/openhands:main
```

Com isso, o OpenHands ficará disponível na porta `3000` e todos os requests de LLM que ele fizer baterão no nosso `localhost:2099`.

---

## 2. O Plot Twist: O que podemos "roubar" do OpenHands?

Embora a integração acima seja legal, você tocou num ponto excelente: **E se implementarmos recursos do OpenHands dentro do Turbo-Agent?**

O OpenHands tem arquiteturas fantásticas que fariam o `turbo-agent` subir de nível drasticamente:

### A. Sandbox de Execução Isolada (Docker)
**Como o OpenHands faz:** Ele não roda comandos bash diretamente na sua máquina host. Ele sobe um container Docker isolado e envia os comandos do LLM para rodar lá dentro via SSH ou API.
**Por que trazer pro Turbo-Agent:** Atualmente, um `run_command` malicioso ou acidental no `turbo-agent` pode deletar pastas do seu projeto raiz. Executar os passos do agente num container Sandbox garante segurança total.

### B. Navegação Web Autônoma (Browser Integration)
**Como o OpenHands faz:** Ele possui um sub-agente dedicado que usa Playwright/Puppeteer para abrir um navegador oculto, clicar em botões, tirar screenshots e devolver o que está na tela para o LLM interpretar.
**Por que trazer pro Turbo-Agent:** Permitiria que o Turbo-Agent validasse se a interface React que ele acabou de codar realmente renderizou corretamente, ou até mesmo fizesse pesquisas na web e raspagem de documentações atualizadas antes de codar.

### C. Visualização de Árvore de Arquivos Inteligente
**Como o OpenHands faz:** Em vez de usar ferramentas de `ls` ou `find` o tempo todo, ele injeta no prompt uma árvore estruturada em XML mostrando o ambiente atual, dando ao agente uma visão "aérea" instantânea.
**Por que trazer pro Turbo-Agent:** Isso resolveria nosso problema de "Context Awareness" (Consciência de Contexto). O agente passaria a entender o formato do projeto inteiro em um único pulso de sistema, poupando tokens e chamadas de ferramenta redundantes.

---

### Próximos Passos
Se fôssemos escolher **uma** feature do OpenHands para implementar no `turbo-agent` agora, a **Navegação Web Autônoma (Playwright)** ou a **Árvore de Arquivos Inteligente** seriam as mais fáceis e de maior impacto inicial.
