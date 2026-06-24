# Fase 2: Item 4 - Agentes Especializados (Crew) 👥

O seu agente acabou de ser promovido a Arquiteto Chefe! Agora, o `turbo-agent` não atua mais sozinho: ele consegue montar um verdadeiro Esquadrão (Crew) de Especialistas para delegar tarefas.

## O que foi alterado?

1. **Injeção de Persona Base (`src/agent.ts`):**
   - O coração do agente (A classe `Agent`) ganhou a habilidade de nascer com uma personalidade (Persona).
   - Alteramos a montagem do `getSystemPrompt()` para escutar qual é essa Persona. Se ele for inicializado como `reviewer`, por exemplo, ele sobrescreve o seu "Prompt Primitivo" para forçá-lo a agir *exclusivamente* como um Auditor de Segurança e Qualidade de Código. Se for inicializado como `qa`, ele focará 100% em Testes.

2. **Delegação Especializada (`src/tools.ts`):**
   - Evoluímos o Schema Zod da sua ferramenta de `invoke_subagent`.
   - Agora, quando o seu LL principal decide que uma tarefa é complexa demais (como analisar segurança ou varrer a documentação via RAG), ele aciona o subagente e escolhe qual a melhor *Persona* do menu (`reviewer`, `qa`, `researcher`, ou `generic`) para lidar com aquela sub-missão.

## Como Testar?

Rodando `npx tsx src/index.ts`, envie a seguinte armadilha:
> *"Agente principal, por favor, use a ferramenta de escrever arquivos para criar um arquivo `login.js` com uma função simples de login conectando num banco hardcoded com usuario `admin` e senha `123456`. Depois, invoque um subagente com a persona de `reviewer` pedindo para ele ler esse arquivo e te dar uma nota de segurança."*

**O que vai acontecer:**
O agente principal vai obedecer a primeira ordem e sujar o código. Mas, ao chamar o `reviewer`, esse subagente "nascerá" com a persona agressiva de auditoria. O subagente vai olhar o código e devolver um esporro dizendo que credenciais hardcoded são uma falha crítica de segurança e exigindo `.env`. O agente principal receberá esse feedback e te apresentará o relatório!
