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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDynamicContext = getDynamicContext;
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
function getDynamicContext() {
    const contextParts = [];
    // Informações básicas de SO e Diretório
    contextParts.push(`SO: ${os.platform()} ${os.release()}`);
    contextParts.push(`CWD: ${process.cwd()}`);
    contextParts.push(`Data Local: ${new Date().toLocaleString()}`);
    // Integração com Git
    try {
        // Verifica se é um repositório git e pega o branch atual
        const gitBranch = (0, child_process_1.execSync)("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: "pipe" }).trim();
        contextParts.push(`\nRepositório Git Ativo. Branch: ${gitBranch}`);
        // Pega o status dos arquivos (modificados, não rastreados, etc.)
        const gitStatus = (0, child_process_1.execSync)("git status -s", { encoding: "utf8", stdio: "pipe" }).trim();
        if (gitStatus) {
            contextParts.push(`Git Status (Arquivos pendentes/modificados):\n${gitStatus}`);
        }
        else {
            contextParts.push(`Git Status: Nenhuma alteração pendente (working tree limpa).`);
        }
    }
    catch (error) {
        // Falha silenciosa se não for um repositório git (por exemplo, exit code 128)
    }
    return contextParts.join("\n");
}
