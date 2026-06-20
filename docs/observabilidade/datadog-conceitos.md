# Conceitos de Observabilidade com Datadog

O **Datadog** (assim como o New Relic, Grafana/ELK e Dynatrace) é o padrão da indústria hoje quando falamos de "ficar observando" (Observabilidade) aplicações em produção. O formato JSON que implementamos nos logs do `Turbo-Agent` é o primeiro passo para essa integração.

A Observabilidade moderna se apoia em 3 grandes pilares (os *Three Pillars of Observability*), e o Datadog agrega todos eles em um único painel:

## 1. Logs (Registros)
O Datadog não gosta de ler texto colorido ou solto. Ele usa um **Agente do Datadog** (um pequeno programa que roda no servidor) que fica lendo a saída do terminal (o *stdout*). 
Quando o seu programa emite um log estruturado:
```json
{"timestamp": "2026-06-20T12:00:00.000Z", "level": "error", "message": "Falha na API", "tool": "write_file"}
```
O Datadog ingere isso, reconhece automaticamente os campos e permite que você crie alertas. 
*Exemplo prático de skill:* Você pode configurar um alerta no Datadog que te envia uma mensagem no Slack se a chave `level` for "error" mais de 10 vezes em uma janela de 5 minutos.

## 2. Metrics (Métricas)
Métricas são números agregados no tempo. Se extrairmos o `durationMs` da execução das ferramentas do Agente, não precisaríamos apenas ler o log; enviaríamos essa métrica numérica para o Datadog.
No painel, você criaria um gráfico de linha chamado **"Tempo Médio de Execução das Ferramentas"**. Se de repente o tempo da ferramenta `web_search` pular de 2 segundos para 30 segundos, o gráfico te mostra o gargalo visualmente, permitindo uma rápida atuação.

## 3. Traces (Rastreamento Distribuído - APM)
É aqui que o Datadog brilha (e pelo que as empresas pagam caro). Se o *Turbo-Agent* se conecta a um banco de dados, depois chama a API do OpenAI e em seguida uma API de terceiros, o Datadog injeta um ID único na requisição usando a biblioteca `dd-trace` do Node.js. 
Ele constrói um "gráfico de cascata" (Flame Graph) visual mostrando a anatomia da requisição:
- **Requisição total:** 3.0s
  - *OpenAI*: 2.5s
  - *Banco de Dados*: 0.3s
  - *Processamento Local*: 0.2s

## Como colocar o Datadog no Node.js (Turbo-Agent)
Para integrar na prática, o processo típico em uma aplicação Node.js é:

1. Instalar a biblioteca oficial no projeto: 
   ```bash
   npm install dd-trace
   ```
2. No início do seu ponto de entrada (por exemplo, `index.ts`), adicionar a inicialização:
   ```typescript
   import tracer from 'dd-trace';
   tracer.init({ logInjection: true });
   ```
3. O servidor ou container Docker roda junto com um `Datadog Agent` configurado, que escuta as métricas e traces gerados e os envia continuamente para a nuvem do Datadog.

**Conclusão:** 
O trabalho de padronizar erros e logar em JSON com a duração de tempo (durationMs) é o "dever de casa" essencial que precede a adoção de uma ferramenta gigante como o Datadog. Sem logs limpos em JSON e métricas de tempo estruturadas, o Datadog não teria informações consistentes para montar seus gráficos e alertas!
