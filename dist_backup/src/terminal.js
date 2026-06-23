"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentTerminal = exports.PersistentTerminal = void 0;
const pty = __importStar(require("node-pty"));
const os = __importStar(require("os"));
const crypto_1 = __importDefault(require("crypto"));
class PersistentTerminal {
    ptyProcess;
    outputBuffer = "";
    currentPromiseResolver = null;
    currentMarker = null;
    constructor() {
        const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
        this.ptyProcess = pty.spawn(shell, [], {
            name: "xterm-color",
            cols: 80,
            rows: 30,
            cwd: process.cwd(),
            env: process.env,
        });
        this.ptyProcess.onData((data) => {
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
    cleanOutput(raw) {
        // Remove ANSI Escape Codes
        let cleaned = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        cleaned = cleaned.trim();
        return cleaned;
    }
    async execute(command, timeoutMs = 30000) {
        if (this.currentPromiseResolver) {
            throw new Error("Um comando já está sendo executado no terminal. Aguarde o término.");
        }
        return new Promise((resolve, reject) => {
            const marker = crypto_1.default.randomBytes(8).toString("hex") + "_END";
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
    kill() {
        this.ptyProcess.kill();
    }
}
exports.PersistentTerminal = PersistentTerminal;
exports.AgentTerminal = new PersistentTerminal();
