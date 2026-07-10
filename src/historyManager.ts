import * as fs from "fs";
import * as path from "path";
import { summarizeMessages } from "./memory";
import { Logger } from "./logger";
import pc from "picocolors";
import ora from "ora";
import { getConfig } from "./config";
import { redactSecretsInText } from "./secretsDetector";

export class HistoryManager {
  private historyFile: string;
  public messages: any[] = [];
  private maxMessages: number;

  constructor(historyFilePath: string, maxMessages: number) {
    this.historyFile = path.join(process.cwd(), historyFilePath);
    this.maxMessages = maxMessages;
  }

  public resetMessages(systemPrompt: string) {
    this.messages = [
      { role: "system", content: systemPrompt }
    ];
  }

  public loadHistory(systemPrompt: string) {
    if (fs.existsSync(this.historyFile)) {
      try {
        const data = fs.readFileSync(this.historyFile, "utf-8");
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed[0] = { role: "system", content: systemPrompt };
          this.messages = parsed;
          Logger.info(`Memória restaurada: ${this.messages.length} mensagens no contexto`);
        }
      } catch (e: any) {
        Logger.error(`Erro ao carregar histórico: ${e.message}`);
      }
    } else {
       this.resetMessages(systemPrompt);
    }
  }

  public saveHistory() {
    try {
      const tempFile = this.historyFile + ".tmp";
      fs.writeFileSync(tempFile, JSON.stringify(this.messages, null, 2), "utf-8");
      fs.renameSync(tempFile, this.historyFile);
    } catch (e: any) {
      Logger.error(`Erro ao salvar histórico: ${e.message}`);
    }
  }

  public clearHistory(systemPrompt: string) {
    this.resetMessages(systemPrompt);
    this.saveHistory();
    Logger.info("Memória apagada com sucesso");
  }

  public addMessage(role: string, content: any) {
     let safeContent = content;
     if (typeof content === "string") {
        safeContent = redactSecretsInText(content);
     } else if (Array.isArray(content)) {
        safeContent = content.map((item: any) => {
           if (item && item.type === "text" && typeof item.text === "string") {
              return { ...item, text: redactSecretsInText(item.text) };
           }
           return item;
        });
     }

     this.messages.push({ role, content: safeContent });
     this.saveHistory();
  }

  public updateSystemPrompt(systemPrompt: string) {
    if (this.messages.length > 0 && this.messages[0].role === "system") {
      this.messages[0].content = systemPrompt;
    }
  }

  public async compactMemoryIfNecessary() {
      const isJson = getConfig().logFormat === 'json';
      
      if (this.messages.length > this.maxMessages) {
        const spinnerMem = isJson ? null : ora(pc.blue("Compactando memória antiga...")).start();
        if (isJson) Logger.info("Compactando memória antiga...");
        try {
          const numToSummarize = Math.floor(this.maxMessages / 2);
          const messagesToSummarize = this.messages.slice(2, numToSummarize + 2);
          const summary = await summarizeMessages(messagesToSummarize);
          
          this.messages = [
            this.messages[0], // System prompt
            this.messages[1], // O Pedido Original do Usuário blindado
            { role: "assistant", content: `[Resumo do Histórico Anterior]:\n${summary}` },
            ...this.messages.slice(numToSummarize + 2) // Mantém a metade mais recente intacta
          ];
          if (spinnerMem) spinnerMem.succeed(pc.green("Memória compactada com sucesso!"));
          else Logger.info("Memória compactada com sucesso!");
          this.saveHistory();
        } catch (err: any) {
          if (spinnerMem) spinnerMem.fail(pc.red(`Erro ao compactar memória: ${err.message}`));
          else Logger.error(`Erro ao compactar memória: ${err.message}`);
          // Fallback para o slice ingênuo
          this.messages = [
            this.messages[0],
            ...this.messages.slice(-(this.maxMessages - 1))
          ];
          this.saveHistory();
        }
      }
  }
}
