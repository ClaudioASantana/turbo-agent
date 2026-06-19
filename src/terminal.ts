import * as pty from "node-pty";
import * as os from "os";
import crypto from "crypto";

export class PersistentTerminal {
  private ptyProcess: pty.IPty;
  private outputBuffer: string = "";
  private currentPromiseResolver: ((output: string) => void) | null = null;
  private currentMarker: string | null = null;

  constructor() {
    const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
    this.ptyProcess = pty.spawn(shell, [], {
      name: "xterm-color",
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data: string) => {
      this.outputBuffer += data;
      if (this.currentMarker && this.currentPromiseResolver) {
        if (this.outputBuffer.includes(this.currentMarker)) {
          // Extract everything before the marker
          const output = this.outputBuffer.split(this.currentMarker)[0];
          this.outputBuffer = "";
          this.currentMarker = null;
          
          const resolve = this.currentPromiseResolver;
          this.currentPromiseResolver = null;
          resolve(this.cleanOutput(output));
        }
      }
    });

    // Início rápido para consumir as mensagens de login (MOTD) do shell
    this.execute("echo 'Terminal Persistente Iniciado'");
  }

  /**
   * Remove sequências ANSI e quebras de linha excessivas.
   */
  private cleanOutput(raw: string): string {
    // Remove ANSI Escape Codes
    let cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    cleaned = cleaned.trim();
    return cleaned;
  }

  public async execute(command: string, timeoutMs: number = 30000): Promise<string> {
    if (this.currentPromiseResolver) {
      throw new Error("Um comando já está sendo executado no terminal. Aguarde o término.");
    }

    return new Promise((resolve, reject) => {
      const marker = crypto.randomBytes(8).toString("hex") + "_END";
      this.currentMarker = marker;
      this.currentPromiseResolver = resolve;
      this.outputBuffer = ""; // Limpa buffer antes de executar

      // Enviamos o comando e na sequência mandamos um echo com o nosso marcador único
      this.ptyProcess.write(`${command}\n`);
      this.ptyProcess.write(`echo ${marker}\n`);

      // Fallback de segurança para não travar o agente caso o comando demore demais ou trave
      setTimeout(() => {
        if (this.currentPromiseResolver === resolve) {
          const resolveRef = this.currentPromiseResolver;
          this.currentMarker = null;
          this.currentPromiseResolver = null;
          resolveRef(this.cleanOutput(this.outputBuffer) + "\n\n[AVISO: O comando excedeu o tempo limite e foi interrompido ou está rodando em background no terminal.]");
        }
      }, timeoutMs);
    });
  }

  public kill() {
    this.ptyProcess.kill();
  }
}

export const AgentTerminal = new PersistentTerminal();
