# Resumo: Adoção do Google ADK no Turbo-Agent

Este documento é um resumo da análise contida em `01-adocao-google-adk.md`. O documento documenta uma decisão arquitetural crucial para o **turbo-agent**: a escolha entre manter uma abordagem "minimalista" (feita em casa) ou adotar um framework robusto como o **Google ADK (Agent Development Kit)**.

## Pontos Principais da Análise

### 1. O Problema Atual (Limitações do Minimalismo)
O `turbo-agent` tem sido usado primariamente como um **Engenheiro de Software IA** (Coding Agent), focado em tarefas complexas de longa duração, como ler múltiplos arquivos, investigar bugs lógicos e refatorar código. A arquitetura atual e minimalista não está dando conta de manter o contexto em tarefas tão extensas, resultando em "truncamento" e perda do histórico do LLM (conforme evidenciado no documento `01-circuit-breaker-truncamento-llm.md`).

### 2. Por que o Google ADK é a solução recomendada?
O ADK traria a robustez necessária para resolver esses problemas, fornecendo:
- **Orquestração Multi-Agente:** Permitiria dividir o `turbo-agent` em uma "equipe" de especialistas (ex: Agente Arquiteto, Agente Explorador, Agente Codificador).
- **Gerenciamento de Estado e Contexto:** Solucionaria o problema do limite de tokens gerenciando a persistência nativamente.
- **Ferramentas de Debugging avançado:** Para inspecionar o raciocínio do agente.

### 3. Integração com o Ecossistema de Negócios
O documento deixa claro o papel dos outros projetos (`gestao-eventos`, `giac`, `gestao-filas`). Eles **não são agentes**, mas sim:
- **Ferramentas** para o `turbo-agent` acionar via protocolo MCP.
- **Clientes** que podem embutir o agente no front-end como um "Copiloto" (assistente para o usuário final).

### 4. Conclusão
Apesar do Google ADK adicionar uma curva de aprendizado e certo *lock-in* (dependência do framework), **a adoção dele (ou de alternativas como LangGraph) é fortemente recomendada**. Apenas com um modelo multi-agentes o `turbo-agent` conseguirá lidar com o nível de complexidade exigido para programar de forma autônoma sem se perder durante a execução.

---
*Nota: Este resumo formaliza a constatação de que o agente "cresceu" e precisa evoluir de um script que executa chamadas simples na API para um sistema multi-agentes robusto focado em engenharia de software.*
