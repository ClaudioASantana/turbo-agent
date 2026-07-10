# Riscos e próximos passos
- `src/agent.ts` concentra muita responsabilidade e tende a crescer ainda mais com novas features.
- A documentação parece ter divergências em relação à implementação atual.
- Há dependência forte de variáveis de ambiente e de defaults que podem variar entre ambientes.
- O agente expõe uma superfície grande de execução local, então permissões e confirmações precisam seguir rígidas.
- O uso de histórico persistente e memória estruturada pode acumular contexto sensível se não houver governança.
- O fluxo geral sugere evolução rápida, o que costuma gerar acoplamentos e comportamentos legados difíceis de enxergar.

## Próximos passos
1. Mapear responsabilidades por arquivo e separar melhor CLI, servidor, agente e tools.
2. Revisar documentação para alinhar o que está descrito com o que realmente existe no código.
3. Auditar as variáveis de ambiente e padronizar defaults críticos.
4. Revisar a política de permissões e confirmações para ações perigosas.
5. Definir uma estratégia clara de retenção/limpeza de histórico e memória.
6. Fazer uma leitura mais profunda do grafo principal em `src/agent.ts` para identificar pontos de simplificação.

## Observação final
O projeto já está em um estágio avançado e poderoso; o ganho maior agora parece vir menos de adicionar recursos e mais de reduzir complexidade, clarear fronteiras e tornar o comportamento mais previsível.
