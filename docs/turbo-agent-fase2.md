# Turbo-Agent Fase 2: Fortalecendo o Chassi 🏎️

O nosso LLM (motor) já está instalado e rodando perfeitamente. As 5 melhorias da Fase 1 deram ao agente os freios, a suspensão e a direção necessários para não bater no muro. 

Se quisermos transformar o `turbo-agent` de um "carro esporte" em um verdadeiro **Robô Industrial de Software**, o próximo foco deve ser em **Autonomia, Visão e Recuperação de Falhas**.

Aqui estão as minhas sugestões de engenharia para a **Fase 2**:

---

## 1. Loop de Auto-Recuperação (Self-Healing)
**O Problema:** Hoje, se o agente escreve um código TypeScript com erro de sintaxe, o terminal acusa o erro, mas o agente pode tentar seguir em frente ou até desistir se o limite de iterações estiver perto.
**A Solução:** Criar uma trava de validação pós-execução.
Sempre que o agente alterar código ou rodar um comando que falhe, o "chassi" intercepta o erro, esconde do usuário, injeta no contexto do agente com a mensagem *"Seu código falhou com este erro. Pense sobre o que você errou, corrija e tente novamente"* e o obriga a iterar em um loop interno de auto-correção por até 3 tentativas antes de te avisar.

## 2. Visão Computacional e Teste de UI (Navegador Autônomo)
**O Problema:** O seu agente hoje só enxerga "código". Ele faz uma alteração no frontend, acha que está lindo, mas a div está quebrada e vermelha na tela.
**A Solução:** Integrar `Puppeteer` ou `Playwright` e passar o modelo LLM para a versão *Vision* (Claude 3.5 Sonnet aceita imagens).
Criaremos a ferramenta `open_browser` e `screenshot_element`. O agente vai poder subir o seu `localhost`, tirar um print da tela, olhar pra imagem e dizer: *"Ih, o botão de login ficou fora de alinhamento, vou arrumar o CSS"*.

## 3. Busca Semântica (RAG Local) para Repositórios Gigantes
**O Problema:** Hoje nós lemos arquivos inteiros. Se você usar o `turbo-agent` num projeto como o repositório do React (que tem milhares de arquivos gigantes), o limite de tokens vai explodir rapidamente.
**A Solução:** Incorporar um banco vetorial local minúsculo (como o `ChromaDB` ou `sqlite-vss`). Quando você abrir o agente, ele varre o projeto em background. Em vez de `read_file`, ele passa a usar `semantic_search("Onde fica a validação de login?")`, que devolve apenas os 3 pedaços de código exatos, salvando milhares de tokens.

## 4. Agentes Especializados (Crew/Esquadrão)
**O Problema:** O nosso subagente atual (`invoke_subagent`) é um clone genérico do principal.
**A Solução:** Criar "Personas". Na hora que o agente principal montar o planejamento, ele poderá delegar para:
- `O Code Reviewer`: Um subagente cujo System Prompt o proíbe de codar, ele só serve para criticar e procurar vulnerabilidades de segurança no código que o agente principal acabou de escrever.
- `O QA`: Um subagente focado estritamente em escrever testes Jest/Cypress.
Isso cria um esquadrão onde o seu agente se torna o Gerente de Projeto.

## 5. Integração Viva com o Git (DevOps)
**O Problema:** O agente edita o código, mas você precisa fazer os commits, resolver merges e criar branches.
**A Solução:** Dar a ele as ferramentas `git_branch`, `git_diff` e `create_pull_request`. 
Você dirá: *"Implemente o login do Google."*
E ele fará:
1. `git checkout -b feature/google-login`
2. Codará a feature.
3. Rodará os testes.
4. `git commit -m "feat: google login"`

---

### Qual você acha mais legal?
Na minha opinião técnica, a **Recuperação de Falhas (Self-Healing)** é a mais vital para resiliência. Mas o **Navegador Autônomo (Visão)** é, de longe, o mais impactante visualmente. E aí, qual caminho te anima mais para essa próxima fase?
