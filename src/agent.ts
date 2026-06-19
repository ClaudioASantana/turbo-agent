import * as fs from "fs";
import * as path from "path";
import { openai } from "./llmClient";
import { extractToolCalls } from "./parser";
import { ToolRegistry } from "./tools";
import { confirmAction } from "./promptUser";
import { getDynamicContext } from "./context";
import { summarizeMessages } from "./memory";
import pc from "picocolors";
import ora from "ora";

const SYSTEM_PROMPT = `You are an autonomous AI assistant.

<context>
{DYNAMIC_CONTEXT}
</context>

You have access to the following tools:
{TOOL_SCHEMAS}

You MUST think before you act. Use a <think>...</think> block to analyze the user's request, plan your approach, or reason about the results of your tools.
After your thought block, to use a tool, you MUST respond EXACTLY with a JSON object in this format, and NOTHING ELSE:
{
  "tool": "tool_name",
  "args": {
    "param1": "value1"
  }
}

Do not add conversational text or greetings outside the think block. Your response must end with the JSON tool call.
You can use multiple tools in sequence. When you are completely finished with the user's request, call the "finish_task" tool with your final answer.

<planning_mode>
If the user's request requires modifying multiple files, creating new features, or large refactors, you MUST create a plan first.
Use the "request_user_approval" tool to present your plan to the user.
Wait for their approval before using any dangerous tools like write_file, replace_in_file, patch_file or run_command.
</planning_mode>

<subagents>
If you need to analyze a large repository, read many files simultaneously, or perform extensive research, DO NOT read files one by one in the main loop. 
Instead, use the "invoke_subagent" tool. This delegates the heavy lifting to an isolated instance and keeps your main context window clean.
</subagents>
`;

export class Agent {
  private globalMessages: any[] = [];
  private historyFile: string;
  private maxIterations: number;
  private maxMessages: number;
  public isSubagent: boolean;
  private consecutiveErrors: number = 0;
  public persona: string;

  constructor(historyFilePath: string = ".agent_history.json", maxIterations = 256, maxMessages = 20, isSubagent = false, persona = "generic") {
    this.historyFile = path.join(process.cwd(), historyFilePath);
    this.maxIterations = maxIterations;
    this.maxMessages = maxMessages;
    this.isSubagent = isSubagent;
    this.persona = persona;
    this.resetMessages();
  }

  private getSystemPrompt(): string {
    const schemas = JSON.stringify(ToolRegistry.getSchemas(), null, 2);
    const dynamicContext = getDynamicContext();
    let prompt = SYSTEM_PROMPT
      .replace("{TOOL_SCHEMAS}", schemas)
      .replace("{DYNAMIC_CONTEXT}", dynamicContext);
      
    if (this.persona === "reviewer") {
      prompt += "\n\n[SPECIALIZED PERSONA: SECURITY & CODE REVIEWER]\nYour sole purpose is to audit code for vulnerabilities, bad practices, and performance issues. You must NEVER write or modify application logic. You must only point out flaws and suggest fixes.";
    } else if (this.persona === "qa") {
      prompt += "\n\n[SPECIALIZED PERSONA: QA ENGINEER]\nYour sole purpose is to write robust automated tests. You must NEVER modify main application logic or features. You only write tests (Jest/Cypress/etc) and verify functionality.";
    } else if (this.persona === "researcher") {
      prompt += "\n\n[SPECIALIZED PERSONA: RESEARCHER]\nYour sole purpose is to read documentation, perform semantic searches, and gather information. You must NEVER modify or write files.";
    }
    
    return prompt;
  }

  private resetMessages() {
    this.globalMessages = [
      { role: "system", content: this.getSystemPrompt() }
    ];
  }

  public loadHistory() {
    if (fs.existsSync(this.historyFile)) {
      try {
        const data = fs.readFileSync(this.historyFile, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed[0] = { role: "system", content: this.getSystemPrompt() };
          this.globalMessages = parsed;
          console.log(`[Memória restaurada: ${this.globalMessages.length} mensagens no contexto]`);
        }
      } catch (e) {
        console.log("[Erro ao carregar histórico]:", e);
      }
    }
  }

  public saveHistory() {
    try {
      fs.writeFileSync(this.historyFile, JSON.stringify(this.globalMessages, null, 2), "utf-8");
    } catch (e) {
      console.log("[Erro ao salvar histórico]:", e);
    }
  }

  public clearHistory() {
    this.resetMessages();
    this.saveHistory();
    console.log("[Memória apagada com sucesso]");
  }

  public async runStep(userPrompt: string): Promise<string | void> {
    this.globalMessages.push({ role: "user", content: userPrompt });
    this.saveHistory();

    let loops = 0;
    while (loops < this.maxIterations) {
      loops++;

      // Memória Inteligente (Auto-Summarization)
      if (this.globalMessages.length > this.maxMessages) {
        const spinnerMem = ora(pc.blue("Compactando memória antiga...")).start();
        try {
          const numToSummarize = Math.floor(this.maxMessages / 2);
          const messagesToSummarize = this.globalMessages.slice(2, numToSummarize + 2);
          const summary = await summarizeMessages(messagesToSummarize);
          
          this.globalMessages = [
            this.globalMessages[0], // System prompt
            this.globalMessages[1], // O Pedido Original do Usuário blindado
            { role: "assistant", content: `[Resumo do Histórico Anterior]:\n${summary}` },
            ...this.globalMessages.slice(numToSummarize + 2) // Mantém a metade mais recente intacta
          ];
          spinnerMem.succeed(pc.green("Memória compactada com sucesso!"));
        } catch (err: any) {
          spinnerMem.fail(pc.red(`Erro ao compactar memória: ${err.message}`));
          // Fallback para o slice ingênuo
          this.globalMessages = [
            this.globalMessages[0],
            ...this.globalMessages.slice(-(this.maxMessages - 1))
          ];
        }
      }

      let response;
      const spinner = ora(pc.blue("O Agente está pensando...")).start();
      try {
        response = await openai.chat.completions.create({
          model: process.env.LLM_MODEL || "qwen-35b-turboquant",
          messages: this.globalMessages,
          temperature: 0.1,
        });
      } catch (error: any) {
        spinner.fail(pc.red(`Erro na API do LLM: ${error.message}`));
        console.log(pc.yellow("Por favor, verifique se o servidor local do LLM está rodando e acessível."));
        break; // Sai do loop e volta para o prompt do usuário
      }
      spinner.stop();

      const reply = response.choices[0].message.content || "";

      this.globalMessages.push({ role: "assistant", content: reply });
      this.saveHistory();

      const toolCall = extractToolCalls(reply);

      if (toolCall && toolCall.tool) {
        if (toolCall.tool === "finish_task") {
          const finalAnswer = toolCall.args?.finalAnswer || 'Concluído';
          if (!this.isSubagent) {
            console.log(pc.green(`\n🤖 Turbo-Agent:\n${finalAnswer}\n`));
          }
          this.consecutiveErrors = 0; // Reseta erros ao concluir
          return finalAnswer;
        }

        if (!this.isSubagent) {
          if (this.consecutiveErrors > 0) {
            console.log(pc.yellow(`\n🔧 Executando ferramenta: ${toolCall.tool} (Auto-Recuperação ${this.consecutiveErrors}/3)`));
          } else {
            console.log(pc.yellow(`\n🔧 Executando ferramenta: ${toolCall.tool}`));
          }
          console.log(pc.gray(JSON.stringify(toolCall.args)));
        }

        const tool = ToolRegistry.getTool(toolCall.tool);
        if (!tool) {
            console.log(`[Erro]: Ferramenta desconhecida: ${toolCall.tool}`);
            this.globalMessages.push({
                role: "user",
                content: `Error: Tool '${toolCall.tool}' does not exist.`
            });
            this.saveHistory();
            continue;
        }

        // Human-in-the-Loop check
        if (tool.dangerous && !this.isSubagent) {
          const approved = await confirmAction(`\n⚠️ O Agente quer executar a ferramenta perigosa '${toolCall.tool}'. Aprovar?`, false);
          if (!approved) {
            console.log("[Ação Negada]");
            this.globalMessages.push({
              role: "user",
              content: `Tool '${toolCall.tool}' failed: User denied permission.`
            });
            this.saveHistory();
            continue;
          }
        } else if (tool.dangerous && this.isSubagent) {
          // Subagentes não podem travar o processo pedindo permissão de console para ferramentas perigosas.
          this.globalMessages.push({
            role: "user",
            content: `Tool '${toolCall.tool}' failed: Subagents are NOT allowed to use dangerous tools.`
          });
          this.saveHistory();
          continue;
        }

        // Execute tool with validation
        let spinnerTool;
        if (!this.isSubagent) spinnerTool = ora(pc.cyan(`Executando ${toolCall.tool}...`)).start();
        
        const toolResult = await ToolRegistry.execute(toolCall.tool, toolCall.args);
        
        if (!toolResult.success) {
          this.consecutiveErrors++;
        } else {
          this.consecutiveErrors = 0;
        }

        if (!this.isSubagent && spinnerTool) {
          if (toolResult.success) {
              spinnerTool.succeed(pc.green(`Ferramenta concluída`));
          } else {
              if (this.consecutiveErrors >= 3) {
                  spinnerTool.fail(pc.red(`Erro crítico na ferramenta.`));
              } else {
                  spinnerTool.warn(pc.yellow(`Falha na ferramenta. Iniciando Auto-Recuperação...`));
              }
          }
        }

        let contentPayload: any;
        
        if (toolResult.success && toolResult.image_url) {
            contentPayload = [
              { type: "text", text: `Tool '${toolCall.tool}' captured a screenshot successfully:` },
              { type: "image_url", image_url: { url: toolResult.image_url } }
            ];
        } else {
            let resultString = JSON.stringify(toolResult);
            if (resultString.length > 3000) {
              resultString = resultString.substring(0, 3000) + "\n\n... [Saída truncada para economizar tokens. Se precisar do resto, refine a busca ou use paginação.]";
            }

            if (!toolResult.success && this.consecutiveErrors < 3) {
                contentPayload = `Tool '${toolCall.tool}' failed with error:\n${resultString}\n\n[SELF-HEALING]: A execução falhou. Não peça desculpas ou desista. Analise o erro cuidadosamente, corrija seus argumentos ou código, e tente novamente. Tentativa ${this.consecutiveErrors} de 3.`;
            } else {
                contentPayload = `Tool '${toolCall.tool}' returned:\n${resultString}`;
            }
        }

        this.globalMessages.push({
            role: "user",
            content: contentPayload
        });
        this.saveHistory();
        
        if (this.consecutiveErrors >= 3) {
            if (!this.isSubagent) console.log(pc.red("\n[Circuit Breaker] Abortando execução devido a 3 falhas consecutivas da ferramenta."));
            return "Erro crítico: O agente falhou 3 vezes consecutivas na mesma operação e o Circuit Breaker foi ativado.";
        }

      } else {
        this.consecutiveErrors++;
        if (!this.isSubagent) {
           if (this.consecutiveErrors >= 3) {
               console.log(pc.red(`[Aviso]: Falha crítica no parser JSON após 3 tentativas.`));
           } else {
               console.log(pc.yellow(`[Aviso]: Não foi possível extrair a ferramenta. Iniciando Auto-Recuperação JSON (${this.consecutiveErrors}/3)...`));
           }
        }
        
        this.globalMessages.push({
          role: "user",
          content: `[SELF-HEALING]: I could not parse a valid JSON tool call from your response. Do not add conversational text. Output ONLY the JSON object with 'tool' and 'args' keys. Attempt ${this.consecutiveErrors} of 3.`
        });
        this.saveHistory();
        
        if (this.consecutiveErrors >= 3) {
            if (!this.isSubagent) console.log(pc.red("\n[Circuit Breaker] Abortando execução por falhas de parsing JSON consecutivas."));
            return "Erro crítico: O agente falhou 3 vezes consecutivas ao formatar a resposta JSON e o Circuit Breaker foi ativado.";
        }
      }
    }

    if (loops >= this.maxIterations) {
      console.log("Limite máximo de iterações atingido. Abortando.");
      return "Error: Maximum iteration limit reached. The subagent aborted before finishing.";
    }
  }
}
