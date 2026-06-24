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
exports.ToolRegistry = exports.ErrorCategory = exports.backgroundProcesses = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const cheerio = __importStar(require("cheerio"));
const zod_1 = require("zod");
const terminal_1 = require("./terminal");
const promptUser_1 = require("./promptUser");
const picocolors_1 = __importDefault(require("picocolors"));
const logger_1 = require("./logger");
const execPromise = (0, util_1.promisify)(child_process_1.exec);
exports.backgroundProcesses = {};
// Helper to find a file recursively if the given path doesn't strictly exist
function resolveFilePath(targetPath, rootDir = ".") {
    const absolutePath = path.resolve(targetPath);
    if (fs.existsSync(absolutePath)) {
        return absolutePath;
    }
    const fileName = path.basename(targetPath);
    let foundPath = null;
    function search(dir) {
        if (foundPath)
            return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build')
                continue;
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                search(fullPath);
            }
            else if (file === fileName || fullPath.endsWith(targetPath)) {
                foundPath = fullPath;
                break;
            }
        }
    }
    search(rootDir);
    return foundPath ? path.resolve(foundPath) : absolutePath;
}
function searchFilesHelper(dir, pattern, isCaseSensitive = false) {
    let results = [];
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file === "node_modules" || file === ".git" || file === "dist" || file === "build")
                continue;
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                results = results.concat(searchFilesHelper(fullPath, pattern, isCaseSensitive));
            }
            else {
                try {
                    const content = fs.readFileSync(fullPath, "utf-8");
                    const searchContent = isCaseSensitive ? content : content.toLowerCase();
                    const searchPattern = isCaseSensitive ? pattern : pattern.toLowerCase();
                    if (searchContent.includes(searchPattern)) {
                        const lines = content.split('\n');
                        lines.forEach((line, i) => {
                            const searchLine = isCaseSensitive ? line : line.toLowerCase();
                            if (searchLine.includes(searchPattern)) {
                                results.push(`${fullPath}:${i + 1}: ${line.trim()}`);
                            }
                        });
                    }
                }
                catch (e) {
                    // Ignore binary/unreadable files
                }
            }
        }
    }
    catch (e) {
        // Ignore unreadable dirs
    }
    return results;
}
function extractSignatures(content, filename) {
    const signatures = [];
    const lines = content.split('\n');
    const regexes = [
        /^(?:export\s+)?(?:default\s+)?class\s+\w+/i,
        /^(?:export\s+)?interface\s+\w+/i,
        /^(?:export\s+)?type\s+\w+/i,
        /^(?:export\s+)?(?:async\s+)?function\s+\w+/i,
        /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[^=]+)\s*=>/i
    ];
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        for (const regex of regexes) {
            if (regex.test(trimmed)) {
                signatures.push(`${filename}:${index + 1}: ${trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed}`);
                break;
            }
        }
    });
    return signatures;
}
const zod_to_json_schema_1 = require("zod-to-json-schema");
const coreMemory_1 = require("./coreMemory");
const nestedGraph_1 = require("./nestedGraph");
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["PARSING"] = "PARSING";
    ErrorCategory["VALIDATION"] = "VALIDATION";
    ErrorCategory["EXECUTION"] = "EXECUTION";
    ErrorCategory["PERMISSION"] = "PERMISSION";
    ErrorCategory["SYSTEM"] = "SYSTEM";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class Registry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    getTool(name) {
        return this.tools.get(name);
    }
    getSchemas() {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: tool._mcpJsonSchema || (0, zod_to_json_schema_1.zodToJsonSchema)(tool.schema)
        }));
    }
    async execute(name, args) {
        const tool = this.tools.get(name);
        if (!tool) {
            logger_1.Logger.debug(`Tool not found: ${name}`);
            return { success: false, category: ErrorCategory.VALIDATION, error: `Tool ${name} not found.` };
        }
        const startTime = Date.now();
        try {
            logger_1.Logger.debug(`Executing tool: ${name}`, { args });
            const parsedArgs = tool.schema.parse(args);
            const result = await tool.execute(parsedArgs);
            const durationMs = Date.now() - startTime;
            logger_1.Logger.debug(`Tool executed successfully: ${name}`, { durationMs });
            return { ...result, durationMs };
        }
        catch (e) {
            const durationMs = Date.now() - startTime;
            logger_1.Logger.debug(`Tool execution failed: ${name}`, { error: e.message, durationMs });
            if (e instanceof zod_1.z.ZodError) {
                return { success: false, category: ErrorCategory.VALIDATION, durationMs, error: "Validation Error: " + e.issues.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ') };
            }
            return { success: false, category: ErrorCategory.EXECUTION, durationMs, error: e.message || String(e) };
        }
    }
}
exports.ToolRegistry = new Registry();
// Registry setup
exports.ToolRegistry.register({
    name: "read_file",
    description: "Reads the content of a file",
    schema: zod_1.z.object({ filePath: zod_1.z.string().describe("Absolute or relative path to the file") }),
    execute: (args) => {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath))
            throw new Error(`File not found: ${args.filePath}`);
        return { success: true, content: fs.readFileSync(filePath, "utf-8") };
    }
});
exports.ToolRegistry.register({
    name: "list_files",
    description: "Lists files in a directory",
    schema: zod_1.z.object({ dirPath: zod_1.z.string().describe("Directory path to list") }),
    execute: (args) => {
        return { success: true, files: fs.readdirSync(path.resolve(args.dirPath)) };
    }
});
exports.ToolRegistry.register({
    name: "write_file",
    description: "DANGER: OVERWRITES ENTIRE FILE. Writes content to a file (creates it if it doesn't exist). Use this ONLY for completely new files or when you intend to erase all previous content. For minor edits, use 'patch_file' or 'multi_replace_in_file'.",
    dangerous: true,
    schema: zod_1.z.object({
        filePath: zod_1.z.string().describe("Absolute or relative path to the file"),
        content: zod_1.z.string().describe("The content to write")
    }),
    execute: (args) => {
        const filePath = path.resolve(args.filePath);
        fs.writeFileSync(filePath, args.content, "utf-8");
        return { success: true, message: `File ${args.filePath} written successfully.` };
    }
});
exports.ToolRegistry.register({
    name: "run_command",
    description: "Executes a bash command in the persistent terminal. State (like cwd, env vars) persists. WARNING: NEVER run interactive commands (like vim, nano, less, top) or anything that requires user input, as it will freeze the agent.",
    dangerous: true,
    schema: zod_1.z.object({
        command: zod_1.z.string().describe("The terminal command to execute"),
        cwd: zod_1.z.string().optional().describe("Optional path. If provided, the terminal will CD into this dir first.")
    }),
    execute: async (args) => {
        try {
            if (args.cwd) {
                await terminal_1.AgentTerminal.execute(`cd ${args.cwd}`);
            }
            const output = await terminal_1.AgentTerminal.execute(args.command);
            return { success: true, stdout: output };
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
});
exports.ToolRegistry.register({
    name: "update_core_memory",
    description: "Atualiza a memória de longo prazo inter-sessões do agente com uma nova regra, preferência ou aprendizado definitivo. Use isso APENAS quando o usuário instruir explicitamente uma nova regra ou preferência de comportamento que deve ser lembrada para o futuro.",
    schema: zod_1.z.object({ rule: zod_1.z.string().describe("A regra ou diretriz definitiva a ser lembrada.") }),
    execute: async (args) => {
        try {
            coreMemory_1.CoreMemory.addRule(args.rule);
            return { success: true, message: `Nova regra armazenada com sucesso na Memória Core: "${args.rule}"` };
        }
        catch (error) {
            return { success: false, error: `Erro ao atualizar a memória core: ${error.message}` };
        }
    }
});
exports.ToolRegistry.register({
    name: "run_command_with_auto_heal",
    description: "Roda um comando de compilação ou teste no shell. Se falhar, aciona um Sub-Grafo isolado com LLM próprio que tenta consertar o código localmente em até 3 tentativas antes de devolver a falha. Útil para delegar o sofrimento de debug.",
    schema: zod_1.z.object({ command: zod_1.z.string() }),
    execute: async (args) => {
        try {
            const result = await (0, nestedGraph_1.runTestAndFix)(args.command);
            return { success: true, message: result };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
});
exports.ToolRegistry.register({
    name: "replace_in_file",
    description: "Replaces all exact occurrences of a string in a file. WARNING: searchValue must match EXACTLY (including whitespaces/newlines). If you only want to change one specific occurrence among many, use 'patch_file' instead.",
    dangerous: true,
    schema: zod_1.z.object({
        filePath: zod_1.z.string(),
        searchValue: zod_1.z.string(),
        replaceValue: zod_1.z.string()
    }),
    execute: (args) => {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath))
            throw new Error(`File not found: ${args.filePath}`);
        let content = fs.readFileSync(filePath, "utf-8");
        if (!content.includes(args.searchValue))
            throw new Error("The searchValue was not found in the file.");
        content = content.split(args.searchValue).join(args.replaceValue);
        fs.writeFileSync(filePath, content, "utf-8");
        return { success: true, message: `Replaced all occurrences in ${args.filePath}` };
    }
});
exports.ToolRegistry.register({
    name: "search_files",
    description: "Searches for an exact string pattern across all files in a directory (ignores node_modules/.git). Returns a list of absolute paths with the matched line. Good for finding hardcoded variables or exact function calls.",
    schema: zod_1.z.object({
        dirPath: zod_1.z.string(),
        pattern: zod_1.z.string(),
        isCaseSensitive: zod_1.z.boolean().optional().default(false)
    }),
    execute: (args) => {
        const dir = path.resolve(args.dirPath);
        if (!fs.existsSync(dir))
            throw new Error(`Directory not found: ${args.dirPath}`);
        return { success: true, results: searchFilesHelper(dir, args.pattern, args.isCaseSensitive) };
    }
});
exports.ToolRegistry.register({
    name: "patch_file",
    description: "Replaces a specific range of lines in a file with new content. StartLine and EndLine are 1-indexed and INCLUSIVE. This is the BEST and SAFEST tool for targeted refactors or minor edits inside large files.",
    dangerous: true,
    schema: zod_1.z.object({
        filePath: zod_1.z.string().describe("EXACT ABSOLUTE path to the file"),
        startLine: zod_1.z.number().describe("The 1-indexed starting line number (inclusive)"),
        endLine: zod_1.z.number().describe("The 1-indexed ending line number (inclusive)"),
        content: zod_1.z.string().describe("The new content to insert")
    }),
    execute: (args) => {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath))
            throw new Error(`File not found: ${args.filePath}`);
        let content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split('\n');
        const startIdx = args.startLine - 1;
        const endIdx = args.endLine - 1;
        if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
            throw new Error(`Invalid line range. File has ${lines.length} lines.`);
        }
        const newLines = args.content.split('\n');
        lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        fs.writeFileSync(filePath, lines.join('\n'), "utf-8");
        return { success: true, message: `Patched lines ${args.startLine} to ${args.endLine} in ${args.filePath}` };
    }
});
exports.ToolRegistry.register({
    name: "multi_replace_in_file",
    description: "Replaces multiple non-contiguous line ranges in a file. Allows you to make surgical edits across different parts of a file without rewriting it all. WARNING: Do not overlap line ranges. The tool automatically sorts them bottom-to-top to prevent line shifting.",
    dangerous: true,
    schema: zod_1.z.object({
        filePath: zod_1.z.string().describe("EXACT ABSOLUTE path to the file"),
        replacements: zod_1.z.array(zod_1.z.object({
            startLine: zod_1.z.number().describe("The 1-indexed starting line number (inclusive)"),
            endLine: zod_1.z.number().describe("The 1-indexed ending line number (inclusive)"),
            content: zod_1.z.string().describe("The new content to insert")
        })).describe("List of chunks to replace.")
    }),
    execute: (args) => {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath))
            throw new Error(`File not found: ${args.filePath}`);
        let content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split('\n');
        // Sort replacements descending by startLine to avoid shifting indices for previous replacements
        const sorted = [...args.replacements].sort((a, b) => b.startLine - a.startLine);
        for (const r of sorted) {
            const startIdx = r.startLine - 1;
            const endIdx = r.endLine - 1;
            if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
                throw new Error(`Invalid line range ${r.startLine}-${r.endLine}. File has ${lines.length} lines.`);
            }
            const newLines = r.content.split('\n');
            lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        }
        fs.writeFileSync(filePath, lines.join('\n'), "utf-8");
        return { success: true, message: `Applied ${sorted.length} patches to ${args.filePath}` };
    }
});
exports.ToolRegistry.register({
    name: "analyze_codebase",
    description: "Semantically analyzes a file or directory to extract ONLY its structure (class signatures, function exports, interfaces). Extremely lightweight. Use this before editing a file if you just want to know its public API.",
    schema: zod_1.z.object({ path: zod_1.z.string() }),
    execute: (args) => {
        const targetPath = resolveFilePath(args.path);
        if (!fs.existsSync(targetPath))
            throw new Error(`Path not found: ${args.path}`);
        let results = [];
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            const files = searchFilesHelper(targetPath, "");
            const uniqueFiles = [...new Set(files.map(f => f.split(':')[0]))];
            for (const file of uniqueFiles) {
                if (file.match(/\.(ts|js|jsx|tsx)$/)) {
                    const content = fs.readFileSync(file, "utf-8");
                    const sigs = extractSignatures(content, file);
                    if (sigs.length > 0) {
                        results.push(`\n--- ${file} ---`, ...sigs);
                    }
                }
            }
        }
        else {
            results = extractSignatures(fs.readFileSync(targetPath, "utf-8"), targetPath);
        }
        return { success: true, analysis: results.length === 0 ? "No structures found." : results.join('\n') };
    }
});
exports.ToolRegistry.register({
    name: "web_search",
    description: "Searches the web using DuckDuckGo",
    schema: zod_1.z.object({ query: zod_1.z.string() }),
    execute: async (args) => {
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const searchResults = [];
        $('.result').each((i, el) => {
            if (i >= 5)
                return;
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const rawUrl = $(el).find('.result__url').attr('href') || "";
            let cleanUrl = rawUrl;
            if (cleanUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
                cleanUrl = decodeURIComponent(cleanUrl.split('uddg=')[1].split('&')[0]);
            }
            else if (cleanUrl.startsWith('/url?q=')) {
                cleanUrl = decodeURIComponent(cleanUrl.split('/url?q=')[1].split('&')[0]);
            }
            if (title && cleanUrl)
                searchResults.push({ title, snippet, url: cleanUrl });
        });
        return { success: true, results: searchResults };
    }
});
exports.ToolRegistry.register({
    name: "fetch_url",
    description: "Fetches a URL and extracts clean text",
    schema: zod_1.z.object({ url: zod_1.z.string() }),
    execute: async (args) => {
        const response = await fetch(args.url);
        const html = await response.text();
        const $ = cheerio.load(html);
        $('script, style, noscript, svg, img, video, audio, iframe, nav, footer, header').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        return { success: true, text: text.substring(0, 8000) };
    }
});
exports.ToolRegistry.register({
    name: "start_background_command",
    description: "Starts a background command. Returns immediately.",
    schema: zod_1.z.object({
        command: zod_1.z.string(),
        id: zod_1.z.string(),
        cwd: zod_1.z.string().optional()
    }),
    execute: (args) => {
        if (exports.backgroundProcesses[args.id])
            throw new Error(`Process '${args.id}' is already running.`);
        const options = args.cwd ? { cwd: path.resolve(args.cwd), shell: true } : { shell: true };
        const child = (0, child_process_1.spawn)(args.command, [], options);
        exports.backgroundProcesses[args.id] = { process: child, logs: [] };
        const handleOutput = (data) => {
            const proc = exports.backgroundProcesses[args.id];
            if (proc) {
                proc.logs.push(...data.toString().split('\n'));
                if (proc.logs.length > 500)
                    proc.logs = proc.logs.slice(-500);
            }
        };
        child.stdout?.on('data', handleOutput);
        child.stderr?.on('data', handleOutput);
        child.on('close', (code) => {
            if (exports.backgroundProcesses[args.id])
                exports.backgroundProcesses[args.id].logs.push(`[Process exited with code ${code}]`);
        });
        return { success: true, message: `Process '${args.id}' started successfully.` };
    }
});
exports.ToolRegistry.register({
    name: "read_process_logs",
    description: "Reads the recent logs of a background process.",
    schema: zod_1.z.object({ id: zod_1.z.string(), lines: zod_1.z.number().optional().default(100) }),
    execute: (args) => {
        const proc = exports.backgroundProcesses[args.id];
        if (!proc)
            throw new Error(`No running process found with id '${args.id}'.`);
        return { success: true, logs: proc.logs.slice(-Math.abs(args.lines)).join('\n') };
    }
});
exports.ToolRegistry.register({
    name: "stop_background_process",
    description: "Stops a running background process.",
    schema: zod_1.z.object({ id: zod_1.z.string() }),
    execute: (args) => {
        const proc = exports.backgroundProcesses[args.id];
        if (!proc)
            throw new Error(`No running process found with id '${args.id}'.`);
        proc.process.kill();
        delete exports.backgroundProcesses[args.id];
        return { success: true, message: `Process '${args.id}' stopped.` };
    }
});
exports.ToolRegistry.register({
    name: "finish_task",
    description: "Call this when the task is fully completed. Provide your comprehensive final answer or summary to the user in the finalAnswer field.",
    schema: zod_1.z.object({ finalAnswer: zod_1.z.string().describe("Your final textual answer, report, or summary.") }),
    execute: () => {
        return { success: true, message: "Task marked as completed." };
    }
});
exports.ToolRegistry.register({
    name: "request_user_approval",
    description: "Use this tool to present a complex implementation plan to the user BEFORE executing code changes. This is mandatory for refactors, new features, or multi-file edits.",
    schema: zod_1.z.object({
        planTitle: zod_1.z.string(),
        planDescription: zod_1.z.string().describe("A detailed, multi-line string explaining what files you will change and why.")
    }),
    execute: async (args) => {
        console.log(picocolors_1.default.magenta(`\n=== PLANO DE IMPLEMENTAÇÃO: ${args.planTitle} ===`));
        console.log(picocolors_1.default.white(args.planDescription));
        const approved = await (0, promptUser_1.confirmAction)(picocolors_1.default.bold(picocolors_1.default.yellow("O usuário aprova o plano acima?")), false);
        if (approved) {
            return { success: true, message: "User approved the plan. Proceed with execution using the appropriate tools." };
        }
        else {
            return { success: false, error: "User REJECTED the plan. Ask the user for feedback and revise the plan before continuing." };
        }
    }
});
exports.ToolRegistry.register({
    name: "invoke_subagent",
    description: "Delegates a complex research or read-only task to a subagent. The subagent runs in a fresh, isolated context and returns its final answer. Use this for fan-out tasks to keep your main context clean.",
    schema: zod_1.z.object({
        task: zod_1.z.string().describe("The highly detailed instructions for the subagent, including what exactly it should return."),
        persona: zod_1.z.enum(['generic', 'reviewer', 'qa', 'researcher']).optional().describe("The specialized role for this subagent. Use generic for standard subagents, reviewer for code audits, qa for writing tests, researcher for docs/RAG.")
    }),
    execute: async (args) => {
        // Dynamic import to avoid circular dependency with Agent class
        const { Agent } = await Promise.resolve().then(() => __importStar(require("./agent")));
        const subHistoryFile = `.agent_history_sub_${Date.now()}.json`;
        const persona = args.persona || "generic";
        console.log(picocolors_1.default.magenta(`\n[Multi-Agente] Iniciando subagente [Persona: ${persona.toUpperCase()}] para a tarefa: ${args.task.substring(0, 50)}...`));
        // Instantiate subagent with smaller limits
        const subAgent = new Agent(subHistoryFile, 15, 10, true, persona);
        try {
            const result = await subAgent.runStep(args.task);
            console.log(picocolors_1.default.magenta(`[Multi-Agente] Subagente finalizou a tarefa.`));
            return { success: true, subagentAnswer: result || "The subagent completed its execution but did not return any finalAnswer text. It might have hit the maximum iterations limit or forgot to include the message." };
        }
        catch (e) {
            return { success: false, error: `Subagent failed: ${e.message}` };
        }
    }
});
exports.ToolRegistry.register({
    name: "browser_navigate",
    description: "Navigate the active browser session to a URL.",
    schema: zod_1.z.object({ url: zod_1.z.string() }),
    execute: async (args) => {
        try {
            const { browserSession } = await Promise.resolve().then(() => __importStar(require("./browserSession")));
            const page = await browserSession.init();
            await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            return await browserSession.extractState();
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
});
exports.ToolRegistry.register({
    name: "browser_click",
    description: "Click an element in the browser using a CSS selector.",
    schema: zod_1.z.object({ selector: zod_1.z.string() }),
    execute: async (args) => {
        try {
            const { browserSession } = await Promise.resolve().then(() => __importStar(require("./browserSession")));
            if (!browserSession.page)
                return { success: false, error: "Browser not initialized. Use browser_navigate first." };
            await browserSession.page.click(args.selector, { timeout: 5000 });
            await browserSession.page.waitForTimeout(1000); // Wait for potential animations/loads
            return await browserSession.extractState();
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
});
exports.ToolRegistry.register({
    name: "browser_type",
    description: "Type text into an input field in the browser.",
    schema: zod_1.z.object({ selector: zod_1.z.string(), text: zod_1.z.string() }),
    execute: async (args) => {
        try {
            const { browserSession } = await Promise.resolve().then(() => __importStar(require("./browserSession")));
            if (!browserSession.page)
                return { success: false, error: "Browser not initialized. Use browser_navigate first." };
            await browserSession.page.fill(args.selector, args.text, { timeout: 5000 });
            return await browserSession.extractState();
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
});
exports.ToolRegistry.register({
    name: "browser_extract",
    description: "Captures the current state of the browser (text and screenshot).",
    schema: zod_1.z.object({}),
    execute: async () => {
        try {
            const { browserSession } = await Promise.resolve().then(() => __importStar(require("./browserSession")));
            if (!browserSession.page)
                return { success: false, error: "Browser not initialized." };
            return await browserSession.extractState();
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
});
exports.ToolRegistry.register({
    name: "invoke_browser_subagent",
    description: "Delegates a web automation/QA task to a specialized browser subagent. Use this for testing UI or scraping data. E.g. 'Test the login flow at http://localhost:3000'.",
    schema: zod_1.z.object({
        task: zod_1.z.string().describe("The comprehensive web task description for the subagent to perform.")
    }),
    execute: async (args) => {
        try {
            const { Agent } = await Promise.resolve().then(() => __importStar(require("./agent")));
            const { browserSession } = await Promise.resolve().then(() => __importStar(require("./browserSession")));
            console.log(picocolors_1.default.cyan(`\n[Browser Subagent] Delegating web task: "${args.task}"`));
            const subagent = new Agent(".agent_browser_history.json", 15, 10, true, "browser");
            const finalAnswer = await subagent.runStep(`You are a Browser Subagent. Complete this task using browser_ tools: ${args.task}\n\nWhen done, use finish_task to return the final answer. DO NOT modify files.`);
            // Cleanup browser after subagent finishes
            await browserSession.close();
            return { success: true, report: finalAnswer };
        }
        catch (e) {
            return { success: false, error: `Browser subagent failed: ${e.message}` };
        }
    }
});
exports.ToolRegistry.register({
    name: "semantic_search",
    description: "Performs RAG semantic search across the entire codebase using natural language. BEST for understanding architecture or finding where a feature is implemented without knowing exact file names. Examples: 'Onde o banco é inicializado?', 'How is user authentication handled?'.",
    schema: zod_1.z.object({
        query: zod_1.z.string().describe("Natural language query to search for in the codebase")
    }),
    execute: async (args) => {
        try {
            const { search } = await Promise.resolve().then(() => __importStar(require("./rag")));
            console.log(picocolors_1.default.cyan(`\n[RAG] Buscando por: "${args.query}"...`));
            const result = await search(args.query);
            return { success: true, results: result };
        }
        catch (e) {
            return { success: false, error: `Semantic search failed: ${e.message}` };
        }
    }
});
exports.ToolRegistry.register({
    name: "create_pull_request",
    description: "Creates a new Git branch, commits all modified files, and provides instructions/commands to open a Pull Request. Use this after fixing a bug or implementing a feature to finalize the GitOps cycle.",
    schema: zod_1.z.object({
        branchName: zod_1.z.string().describe("The name of the new branch to create (e.g., fix-login-security)"),
        commitMessage: zod_1.z.string().describe("The commit message explaining the fix"),
        prTitle: zod_1.z.string().describe("The title of the Pull Request"),
        prBody: zod_1.z.string().describe("The description body of the Pull Request")
    }),
    execute: async (args) => {
        try {
            const { execSync } = require('child_process');
            console.log(picocolors_1.default.magenta(`\n[GitOps] Iniciando ciclo de CI/CD para a branch '${args.branchName}'...`));
            // 1. Criar branch
            execSync(`git checkout -b ${args.branchName}`);
            console.log(picocolors_1.default.green(`✔ Branch '${args.branchName}' criada com sucesso.`));
            // 2. Add files
            execSync(`git add .`);
            // 3. Commit
            execSync(`git commit -m "${args.commitMessage}"`);
            console.log(picocolors_1.default.green(`✔ Commit realizado: "${args.commitMessage}"`));
            const finalReport = `
GitOps concluído localmente com sucesso!
- Branch: ${args.branchName}
- Commit: ${args.commitMessage}

Para enviar este código e criar o Pull Request remotamente, o desenvolvedor deve rodar:
1) git push -u origin ${args.branchName}
2) gh pr create --title "${args.prTitle}" --body "${args.prBody}"
`;
            return { success: true, report: finalReport };
        }
        catch (e) {
            return { success: false, error: `GitOps failed: ${e.message}. Certifique-se de que não há conflitos ou que o repositório está inicializado.` };
        }
    }
});
exports.ToolRegistry.register({
    name: "create_artifact",
    description: "Creates a markdown artifact to store long reports, analysis, or structured documents instead of cluttering the terminal. Returns the path of the created file.",
    schema: zod_1.z.object({
        title: zod_1.z.string().describe("A short, URL-friendly title for the artifact (e.g. 'architecture-analysis')"),
        content: zod_1.z.string().describe("The markdown content to save")
    }),
    execute: (args) => {
        const artifactDir = path.resolve(".agent_artifacts");
        if (!fs.existsSync(artifactDir)) {
            fs.mkdirSync(artifactDir, { recursive: true });
        }
        const safeTitle = args.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filePath = path.join(artifactDir, `${safeTitle}.md`);
        fs.writeFileSync(filePath, args.content, "utf-8");
        console.log(picocolors_1.default.green(`\n📝 Artefato criado: ${filePath}`));
        return { success: true, message: `Artifact saved to ${filePath}` };
    }
});
exports.ToolRegistry.register({
    name: "run_sandboxed_command",
    description: "Runs a shell command inside an ephemeral Docker container. Use this to safely execute generated python code or run untrusted commands. The workspace is mounted.",
    dangerous: true,
    schema: zod_1.z.object({
        image: zod_1.z.string().optional().default("node:20").describe("The docker image to use (e.g. 'python:3.10', 'node:20')"),
        command: zod_1.z.string().describe("The command to execute inside the container")
    }),
    execute: async (args) => {
        try {
            const { exec } = require('child_process');
            const util = require('util');
            const execAsync = util.promisify(exec);
            console.log(picocolors_1.default.yellow(`\n[Sandbox] Executando comando em container Docker (${args.image})...`));
            const cwd = process.cwd();
            // Replace double quotes to avoid breaking the bash -c string
            const safeCommand = args.command.replace(/"/g, '\\"');
            // We run docker with --rm to clean up, and mount current dir to /workspace
            const dockerCommand = `docker run --rm -v "${cwd}:/workspace" -w /workspace ${args.image} bash -c "${safeCommand}"`;
            const { stdout, stderr } = await execAsync(dockerCommand);
            return { success: true, stdout, stderr };
        }
        catch (e) {
            return { success: false, error: e.message, stderr: e.stderr };
        }
    }
});
exports.ToolRegistry.register({
    name: "memorize",
    description: "Saves a rule, learning, or preference to your long-term vector memory. Use this proactively to remember user preferences or project gotchas for future sessions.",
    schema: zod_1.z.object({
        content: zod_1.z.string().describe("The text to remember. E.g. 'Always use camelCase for variables in this project.'")
    }),
    execute: async (args) => {
        try {
            const { remember } = await Promise.resolve().then(() => __importStar(require("./memoryVector")));
            await remember(args.content);
            return { success: true, message: "Saved to long-term memory." };
        }
        catch (e) {
            return { success: false, error: `Failed to memorize: ${e.message}` };
        }
    }
});
