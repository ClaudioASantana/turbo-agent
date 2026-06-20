import { openai } from "./llmClient";
import { extractToolCalls } from "./parser";
import { ToolRegistry, ErrorCategory, ToolResult } from "./tools";
import pc from "picocolors";
import ora from "ora";
import { getConfig } from "./config";
import { Logger } from "./logger";
import { auditToolCall, auditToolResult, logAuditEvent } from "./audit";
import { buildSystemPrompt } from "./promptBuilder";
import { HistoryManager } from "./historyManager";
import { SecurityManager } from "./securityManager";
import { DatadogDispatcher } from "./datadog";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

export class Agent {
  public historyManager: HistoryManager;
  private maxIterations: number;
  public isSubagent: boolean;
  private consecutiveErrors: number = 0;
  public persona: string;

  constructor(historyFilePath: string = ".agent_history.json", maxIterations?: number, maxMessages?: number, isSubagent = false, persona = "generic") {
    const config = getConfig();
    this.maxIterations = maxIterations ?? config.maxIterations;
    const resolvedMaxMessages = maxMessages ?? config.maxMessages;
    this.isSubagent = isSubagent;
    this.persona = persona;
    
    this.historyManager = new HistoryManager(historyFilePath, resolvedMaxMessages);
    const initialPrompt = buildSystemPrompt(this.persona);
    this.historyManager.loadHistory(initialPrompt);
    
    if (!this.isSubagent) {
      logAuditEvent({ type: "agent_start", timestamp: new Date().toISOString() });
    }
  }

  public loadHistory() {
    this.historyManager.loadHistory(buildSystemPrompt(this.persona));
  }

  public saveHistory() {
    this.historyManager.saveHistory();
  }

  public clearHistory() {
    this.historyManager.clearHistory(buildSystemPrompt(this.persona));
  }

  public async runStep(userPrompt: string): Promise<string | void> {
    // --- MEMÓRIA VETORIAL ---
    try {
      const { recall } = await import("./memoryVector");
      const memories = await recall(userPrompt);
      const memoryContext = memories.length > 0 ? memories.join("\n\n---\n") : "Nenhuma preferência ou regra salva no contexto atual.";
      if (this.historyManager.messages.length > 0 && this.historyManager.messages[0].role === "system") {
        this.historyManager.updateSystemPrompt(buildSystemPrompt(this.persona, memoryContext));
      }
    } catch (e: any) {
      Logger.warn(`Falha ao injetar memória vetorial: ${e.message}`);
    }
    // ------------------------

    this.historyManager.addMessage("user", userPrompt);

    let loops = 0;
    while (loops < this.maxIterations) {
      loops++;

      // Memória Inteligente (Auto-Summarization)
      await this.historyManager.compactMemoryIfNecessary();
      const isJson = getConfig().logFormat === 'json';

      const spinner = isJson ? null : ora(pc.blue("O Agente está pensando...")).start();
      if (isJson) Logger.info("O Agente está pensando...");
      let fullReply = "";
      try {
        const stream = await openai.chat.completions.create({
          model: process.env.LLM_MODEL || "qwen-35b-turboquant",
          messages: this.historyManager.messages,
          temperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.2,
          top_p: process.env.LLM_TOP_P ? parseFloat(process.env.LLM_TOP_P) : 0.95,
          presence_penalty: process.env.LLM_PRESENCE_PENALTY ? parseFloat(process.env.LLM_PRESENCE_PENALTY) : 0.0,
          frequency_penalty: process.env.LLM_FREQUENCY_PENALTY ? parseFloat(process.env.LLM_FREQUENCY_PENALTY) : 0.0,
          max_tokens: process.env.LLM_MAX_TOKENS ? parseInt(process.env.LLM_MAX_TOKENS) : 8192,
          stream: true,
        });
        
        let firstChunk = true;
        let isInsideJson = false;
        for await (const chunk of stream) {
            if (firstChunk) {
                if (spinner) spinner.stop();
                if (!this.isSubagent) {
                    if (!isJson) process.stdout.write(pc.cyan("\n🤖 Turbo-Agent Raciocinando...\n"));
                    else Logger.debug("Turbo-Agent Raciocinando...");
                }
                firstChunk = false;
            }
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
                fullReply += content;
                
                // Detects if the agent is starting to output the JSON tool call block
                if (!isInsideJson && (fullReply.includes("```json") || (fullReply.includes("{") && fullReply.includes('"tool"')))) {
                   isInsideJson = true;
                   if (!this.isSubagent) {
                       if (!isJson) process.stdout.write(pc.dim("\n[Gerando código/parâmetros em background...]\n"));
                       else Logger.debug("Gerando código/parâmetros em background...");
                   }
                }

                if (!this.isSubagent && !isInsideJson && !isJson) {
                   process.stdout.write(pc.dim(content));
                }
            }
        }
        if (!this.isSubagent && !isJson) process.stdout.write("\n\n");
      } catch (error: any) {
        if (spinner) spinner.fail(pc.red(`Erro na API do LLM: ${error.message}`));
        else Logger.error(`Erro na API do LLM: ${error.message}`);
        Logger.warn("Por favor, verifique se o servidor local do LLM está rodando e acessível.");
        break; // Sai do loop e volta para o prompt do usuário
      }

      const reply = fullReply;

      this.historyManager.addMessage("assistant", reply);

      const toolCall = extractToolCalls(reply);

      if (toolCall && toolCall.tool) {
        if (toolCall.tool === "finish_task") {
          const finalAnswer = toolCall.args?.finalAnswer || 'Concluído';
          if (!this.isSubagent) {
            if (!isJson) console.log(pc.green(`\n🤖 Turbo-Agent:\n${finalAnswer}\n`));
            else Logger.info(`Finalizado`, { finalAnswer });
          }
          this.consecutiveErrors = 0; // Reseta erros ao concluir
          await DatadogDispatcher.flush();
          return finalAnswer;
        }

        if (!this.isSubagent) {
          if (this.consecutiveErrors > 0) {
            if (!isJson) console.log(pc.yellow(`\n🔧 Executando ferramenta: ${toolCall.tool} (Auto-Recuperação ${this.consecutiveErrors}/3)`));
            else Logger.info(`Executando ferramenta (Auto-Recuperação ${this.consecutiveErrors}/3)`, { tool: toolCall.tool });
          } else {
            if (!isJson) console.log(pc.yellow(`\n🔧 Executando ferramenta: ${toolCall.tool}`));
            else Logger.info(`Executando ferramenta`, { tool: toolCall.tool });
          }
          let argsPreview = JSON.stringify(toolCall.args || {});
          if (argsPreview.length > 150) {
              argsPreview = argsPreview.substring(0, 150) + pc.gray(" ... [argumentos ocultos para não poluir a tela]");
          }
          if (!isJson) console.log(pc.gray(argsPreview));
          else Logger.debug(`Argumentos da ferramenta`, { args: toolCall.args });
        }

        const tool = ToolRegistry.getTool(toolCall.tool);
        if (!tool) {
            Logger.error(`Ferramenta desconhecida: ${toolCall.tool}`);
            this.historyManager.addMessage("user", `Error: Tool '${toolCall.tool}' does not exist.`);
            continue;
        }

        // Security checks: Permissions
        const auth = await SecurityManager.authorize(toolCall.tool, toolCall.args, this.isSubagent);
        if (!auth.approved) {
           this.historyManager.addMessage("user", auth.userMessage);
           continue;
        }

        // Execute tool with validation
        let spinnerTool;
        if (!this.isSubagent && toolCall.tool !== "request_user_approval") {
          spinnerTool = isJson ? null : ora(pc.cyan(`Executando ${toolCall.tool}...`)).start();
        }
        
        auditToolCall(toolCall.tool, toolCall.args || {});
        let toolResult = await ToolRegistry.execute(toolCall.tool, toolCall.args);
        
        // --- SELF-HEALING (LSP/Compiler Check) ---
        const writeTools = ["write_file", "replace_in_file", "patch_file", "multi_replace_in_file"];
        let tscError = "";
        if (toolResult.success && writeTools.includes(toolCall.tool)) {
          if (!this.isSubagent && spinnerTool) {
             spinnerTool.text = pc.cyan(`Executando verificação de sintaxe (Self-Healing)...`);
          }
          try {
             await execAsync("npx tsc --noEmit");
          } catch (e: any) {
             tscError = e.stdout || e.stderr || e.message;
             // We inject the error into the result so the LLM sees it
             toolResult.success = false;
             toolResult.category = ErrorCategory.EXECUTION;
             toolResult.error = `O arquivo foi salvo fisicamente, mas a compilação do TypeScript falhou com os seguintes erros:\n${tscError}`;
          }
        }
        // ------------------------------------------

        auditToolResult(toolCall.tool, JSON.stringify(toolResult));
        
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
                  spinnerTool.warn(pc.yellow(`Falha (Self-Healing ativado). Iniciando Auto-Recuperação...`));
              }
          }
        } else if (!this.isSubagent && isJson) {
           if (!toolResult.success && this.consecutiveErrors >= 3) Logger.error(`Erro crítico na ferramenta: ${toolCall.tool}`);
           else if (!toolResult.success) Logger.warn(`Falha na ferramenta (Self-Healing ativado): ${toolCall.tool}`);
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
                let contextMessage = "A execução falhou.";
                if (toolResult.category === ErrorCategory.VALIDATION) {
                    contextMessage = "Os argumentos fornecidos não correspondem ao schema esperado para esta ferramenta. Verifique o schema e tente novamente com os tipos corretos.";
                } else if (toolResult.category === ErrorCategory.EXECUTION) {
                    contextMessage = "A ferramenta falhou durante a sua execução. Analise o erro para entender se foi um problema de ambiente, comando inválido ou arquivo inexistente.";
                }

                contentPayload = `Tool '${toolCall.tool}' failed with error:\n${resultString}\n\n[SELF-HEALING]: ${contextMessage} Não peça desculpas ou desista. Analise o erro cuidadosamente, corrija e tente novamente. Tentativa ${this.consecutiveErrors} de 3.`;
            } else {
                contentPayload = `Tool '${toolCall.tool}' returned:\n${resultString}`;
            }
        }

        this.historyManager.addMessage("user", contentPayload);
        
        if (this.consecutiveErrors >= 3) {
            if (!this.isSubagent) {
               if (!isJson) console.log(pc.red("\n[Circuit Breaker] Abortando execução devido a 3 falhas consecutivas da ferramenta."));
               else Logger.error("Circuit Breaker ativado (3 falhas consecutivas na ferramenta).");
            }
            await DatadogDispatcher.flush();
            return "Erro crítico: O agente falhou 3 vezes consecutivas na mesma operação e o Circuit Breaker foi ativado.";
        }

      } else {
        this.consecutiveErrors++;
        if (!this.isSubagent) {
           if (this.consecutiveErrors >= 3) {
               if (!isJson) console.log(pc.red(`[Aviso]: Falha crítica no parser JSON após 3 tentativas.`));
               else Logger.error("Falha crítica no parser JSON após 3 tentativas.");
           } else {
               if (!isJson) console.log(pc.yellow(`[Aviso]: Não foi possível extrair a ferramenta. Iniciando Auto-Recuperação JSON (${this.consecutiveErrors}/3)...`));
               else Logger.warn(`Auto-Recuperação JSON iniciada (${this.consecutiveErrors}/3)`);
           }
        }
        
        this.historyManager.addMessage("user", `[PARSING_ERROR]: I could not parse a valid JSON tool call from your response. Do not add conversational text. Output ONLY the JSON object with 'tool' and 'args' keys. Attempt ${this.consecutiveErrors} of 3.`);
        
        if (this.consecutiveErrors >= 3) {
            if (!this.isSubagent) {
               if (!isJson) console.log(pc.red("\n[Circuit Breaker] Abortando execução por falhas de parsing JSON consecutivas."));
               else Logger.error("Circuit Breaker ativado (falhas de parsing JSON consecutivas).");
            }
            await DatadogDispatcher.flush();
            return "Erro crítico: O agente falhou 3 vezes consecutivas ao formatar a resposta JSON e o Circuit Breaker foi ativado.";
        }
      }
    }

    if (loops >= this.maxIterations) {
      Logger.error("Limite máximo de iterações atingido. Abortando.");
      await DatadogDispatcher.flush();
      return "Error: Maximum iteration limit reached. The subagent aborted before finishing.";
    }
  }
}
