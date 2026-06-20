# Correção de Incidentes: Truncamento do LLM e Circuit Breaker

**Data do Incidente:** 20 de Junho de 2026
**Componentes Afetados:** Parser JSON, Auto-Recuperação, Circuit Breaker

## O Problema Relatado
Durante a operação em um projeto externo (`gestao-eventos-frontend`), o Turbo-Agent entrou em falha crítica após a compactação de memória e teve sua execução abortada após 3 erros consecutivos pelas ferramentas.

**Trace do Erro:**
1. `Memória compactada com sucesso!`
2. O agente começou a raciocinar (`<think>...`) e de repente: `[Aviso]: Não foi possível extrair a ferramenta. Iniciando Auto-Recuperação JSON (1/3)...`
3. O Agente tentou rodar `invoke_subagent` e falhou.
4. O Agente tentou rodar `read_file` em um arquivo inexistente e falhou.
5. `[Circuit Breaker] Abortando execução devido a 3 falhas consecutivas da ferramenta.`

## Causa Raiz
A falha inicial não foi um bug no código do Turbo-Agent, mas sim um comportamento anômalo do servidor de inferência do LLM local (Ollama/LM Studio):
- O servidor cortou a resposta do LLM prematuramente no meio da geração do JSON (ex: estourou o limite de tokens preditivos, resultando em `{\n  "tool...`).
- O parser do Turbo-Agent `extractToolCalls` não consegue processar um JSON cortado ao meio e acionou o sistema de Auto-Recuperação.
- Por conta da quebra de contexto na sua própria janela de resposta, o LLM se confundiu (alucinação) nas iterações seguintes:
  - Tentou injetar `prompt` em vez de `task` no schema do `invoke_subagent`.
  - Tentou ler o arquivo `EditEventoClient.tsx` no Frontend (sendo que o arquivo no Next.js App Router se chamava `page.tsx`).

## Ação do Turbo-Agent (Sucesso do Design)
O incidente provou a eficácia da arquitetura corporativa implementada. O **Circuit Breaker** agiu brilhantemente ao interceptar as alucinações repetidas e encerrou a execução no 3º erro consecutivo. 
Caso o Circuit Breaker não existisse, o agente ficaria preso num loop infinito de alucinações ("Death Loop"), consumindo 100% da CPU local ou torrando milhares de tokens em requisições de API na tentativa desesperada de corrigir a própria alucinação.

## Solução do Bug Específico no Frontend (Gestão de Eventos)
De brinde, identificou-se que o bug que o usuário tentava consertar no seu frontend derivava de um problema de tipagem (Plural vs Singular) entre o formulário e a API:
- O Zod e o formulário agrupavam a data da lista num array chamado `periodos`.
- O backend passou a exigir a chave `periodo`.
- **Correção aplicada:** Injeção de mapeamento no componente `formulario-eventos.tsx`:
  \`\`\`typescript
  periodo: data.periodos,
  // ...
  delete dadosMapeados.periodos;
  \`\`\`
