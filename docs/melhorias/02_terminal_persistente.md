# Melhoria 02: Terminal Persistente (Stateful Shell) - Concluída!

O `turbo-agent` acaba de ganhar uma fundação sólida para executar comandos de sistema como um agente avançado! Nós removemos a execução descartável (`exec` clássico do Node) e substituímos por um pseudo-terminal verdadeiro de fundo usando a biblioteca padrão da indústria: **node-pty** (a mesma que o VS Code usa por debaixo dos panos).

## O que isso significa na prática?

1. **Estado Compartilhado (Stateful):**
   Antes, se o agente tentasse instalar pacotes numa pasta específica chamando `cd backend` numa ferramenta, e depois `npm install` na ferramenta seguinte, o segundo comando falhava porque ele não "lembrava" que tinha trocado de pasta. Agora, é **exatamente como se ele tivesse uma aba de bash aberta o tempo todo**.

2. **Novos Módulos e Refatorações:**
   - Instalamos o `node-pty` com sucesso no seu ambiente.
   - Criamos o `src/terminal.ts`, que isola a lógica de esperar a execução dos comandos de forma inteligente usando *UUID markers* (para não travar se o comando não soltar output).
   - Refatoramos a ferramenta `run_command` no `src/tools.ts` para invocar esse terminal unificado.

## Como Testar?

Reinicie o seu agente (`npx tsx src/index.ts`) e proponha este desafio exato a ele:

> *"Execute um comando para exportar a variável AMBIENTE=producao. Depois chame outra ferramenta separada para dar um echo no $AMBIENTE. Quero ver se você lembra."*

Você verá que a segunda ferramenta vai imprimir "producao" ao invés de vazio, comprovando que o seu agente tem **Persistência de Estado no Terminal**.
