# Analise de `src/terminal.ts`

> Atualizado em: 26/06/2026 — Terminal persistente e isolado.

## Visao geral

`src/terminal.ts` implementa o terminal persistente usado por `run_command`. Em vez de `exec` descartavel, o projeto usa `node-pty` com um container Docker dedicado.

## O que faz

- Sobe um container `node:20` via `docker run`
- Monta o workspace atual em `/workspace`
- Mantem um processo `bash` persistente
- Executa comandos e captura a saida ate um marcador de fim
- Limpa ANSI codes da saida retornada

## Comportamento importante

- Se o workspace muda, `reinitialize()` derruba o terminal anterior e cria outro
- O comando tem timeout de seguranca (default 30s)
- Se travar, retorna aviso ao usuario ao inves de bloquear indefinidamente

## Pontos fortes

- Estado persistente entre comandos
- Reduz dano potencial ao isolar shell em Docker
- Integra bem com o fluxo de `run_command`

## Riscos

- Depende de Docker estar disponivel na maquina host
- Ainda permite comandos arbitrarios dentro do container
- O debug de stdout do PTY ainda aparece no console em alguns casos

## Resumo

`src/terminal.ts` e a base da execucao de shell do Turbo-Agent e uma das maiores melhorias de seguranca do projeto.
