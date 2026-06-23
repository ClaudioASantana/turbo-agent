import * as fs from "fs";
import * as path from "path";
import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import * as cheerio from "cheerio";
import { z } from "zod";
import { AgentTerminal } from "./terminal";
import { confirmAction } from "./promptUser";
import pc from "picocolors";
import { Logger } from "./logger";
import { agentEvents } from "./agent";
const execPromise = promisify(exec);

export const backgroundProcesses: Record<string, { process: ChildProcess, logs: string[], command: string, status: string }> = {};

// Helper to find a file recursively if the given path doesn't strictly exist
function resolveFilePath(targetPath: string, rootDir: string = "."): string {
  const absolutePath = path.resolve(targetPath);
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }
  
  const fileName = path.basename(targetPath);
  let foundPath: string | null = null;
  
  function search(dir: string) {
    if (foundPath) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'build') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        search(fullPath);
      } else if (file === fileName || fullPath.endsWith(targetPath)) {
        foundPath = fullPath;
        break;
      }
    }
  }
  search(rootDir);
  return foundPath ? path.resolve(foundPath) : absolutePath;
}

function searchFilesHelper(dir: string, pattern: string, isCaseSensitive: boolean = false): string[] {
  let results: string[] = [];
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === "node_modules" || file === ".git" || file === "dist" || file === "build") continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(searchFilesHelper(fullPath, pattern, isCaseSensitive));
      } else {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const searchContent = isCaseSensitive ? content : content.toLowerCase();
          const searchPattern = isCaseSensitive ? pattern : pattern.toLowerCase();
          
          if (searchContent.includes(searchPattern)) {
            const lines = content.split('\n');
            lines.forEach((line, i) => {
              const searchLine = isCaseSensitive ? line : line.toLowerCase();
              if (searchLine.includes(searchPattern)) {
                results.push(`${fullPath}:${i+1}: ${line.trim()}`);
              }
            });
          }
        } catch (e) {
          // Ignore binary/unreadable files
        }
      }
    }
  } catch (e) {
    // Ignore unreadable dirs
  }
  return results;
}

function extractSignatures(content: string, filename: string): string[] {
  const signatures: string[] = [];
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

import { zodToJsonSchema } from "zod-to-json-schema";

export enum ErrorCategory {
  PARSING = 'PARSING',
  VALIDATION = 'VALIDATION',
  EXECUTION = 'EXECUTION',
  PERMISSION = 'PERMISSION',
  SYSTEM = 'SYSTEM'
}

export interface ToolResult {
  success: boolean;
  category?: ErrorCategory;
  error?: string;
  [key: string]: any;
}

export interface ToolDef<T extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
  dangerous?: boolean;
  execute: (args: z.infer<T>) => Promise<any> | any;
}

class Registry {
  private tools: Map<string, ToolDef<any>> = new Map();

  register<T extends z.ZodTypeAny>(tool: ToolDef<T>) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDef<any> | undefined {
    return this.tools.get(name);
  }

  getSchemas() {
    // Import here to avoid top-level require issues if any
    const { convertToOpenAITool } = require("@langchain/core/utils/function_calling");
    
    const cleanSchemaParams = (params: any) => {
      if (!params) return;
      delete params.$schema;
      delete params.additionalProperties;
      
      if (params.properties) {
        for (const key of Object.keys(params.properties)) {
          if (params.properties[key].default !== undefined) {
            delete params.properties[key].default;
          }
        }
      }
    };

    return Array.from(this.tools.values()).map(tool => {
      if ((tool as any)._mcpJsonSchema) {
        let mcpSchema = JSON.parse(JSON.stringify((tool as any)._mcpJsonSchema));
        if (Object.keys(mcpSchema).length === 0) {
          mcpSchema = { type: "object", properties: {} };
        } else if (!mcpSchema.type) {
          mcpSchema.type = "object";
        }
        
        cleanSchemaParams(mcpSchema);
        
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: mcpSchema
          }
        };
      }
      
      const oaiTool = convertToOpenAITool(tool as any);
      cleanSchemaParams(oaiTool.function.parameters);
      
      return oaiTool;
    });
  }

  async execute(name: string, args: any): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      Logger.debug(`Tool not found: ${name}`);
      return { success: false, category: ErrorCategory.VALIDATION, error: `Tool ${name} not found.` };
    }

    const startTime = Date.now();
    try {
      Logger.debug(`Executing tool: ${name}`, { args });
      const parsedArgs = tool.schema.parse(args);
      const result = await tool.execute(parsedArgs);
      const durationMs = Date.now() - startTime;
      Logger.debug(`Tool executed successfully: ${name}`, { durationMs });
      return { ...result, durationMs };
    } catch (e: any) {
      const durationMs = Date.now() - startTime;
      Logger.debug(`Tool execution failed: ${name}`, { error: e.message, durationMs });
      if (e instanceof z.ZodError) {
        return { success: false, category: ErrorCategory.VALIDATION, durationMs, error: "Validation Error: " + e.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ') };
      }
      return { success: false, category: ErrorCategory.EXECUTION, durationMs, error: e.message || String(e) };
    }
  }
}

export const ToolRegistry = new Registry();

// Registry setup
ToolRegistry.register({
  name: "read_file",
  description: "Reads the content of a file",
  schema: z.object({ filePath: z.string().describe("Absolute or relative path to the file") }),
  execute: (args) => {
    const filePath = resolveFilePath(args.filePath);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${args.filePath}`);
    return { success: true, content: fs.readFileSync(filePath, "utf-8") };
  }
});

ToolRegistry.register({
  name: "list_files",
  description: "Lists files in a directory",
  schema: z.object({ dirPath: z.string().describe("Directory path to list") }),
  execute: (args) => {
    return { success: true, files: fs.readdirSync(path.resolve(args.dirPath)) };
  }
});

ToolRegistry.register({
  name: "write_file",
  description: "DANGER: OVERWRITES ENTIRE FILE. Writes content to a file (creates it if it doesn't exist). Use this ONLY for completely new files or when you intend to erase all previous content. For minor edits, use 'patch_file' or 'multi_replace_in_file'.",
  dangerous: true,
  schema: z.object({ 
    filePath: z.string().describe("Absolute or relative path to the file"),
    content: z.string().describe("The content to write")
  }),
  execute: (args) => {
    const filePath = path.resolve(args.filePath);
    fs.writeFileSync(filePath, args.content, "utf-8");
    return { success: true, message: `File ${args.filePath} written successfully.` };
  }
});

ToolRegistry.register({
  name: "run_command",
  description: "Executes a bash command in the persistent terminal. State (like cwd, env vars) persists. WARNING: NEVER run interactive commands (like vim, nano, less, top) or anything that requires user input, as it will freeze the agent.",
  dangerous: true,
  schema: z.object({
    command: z.string().describe("The terminal command to execute"),
    cwd: z.string().optional().describe("Optional path. If provided, the terminal will CD into this dir first.")
  }),
  execute: async (args) => {
    try {
      if (args.cwd) {
        await AgentTerminal.execute(`cd ${args.cwd}`);
      }
      const output = await AgentTerminal.execute(args.command);
      return { success: true, stdout: output };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
});

ToolRegistry.register({
  name: "replace_in_file",
  description: "Replaces all exact occurrences of a string in a file. WARNING: searchValue must match EXACTLY (including whitespaces/newlines). If you only want to change one specific occurrence among many, use 'patch_file' instead.",
  dangerous: true,
  schema: z.object({
    filePath: z.string(),
    searchValue: z.string(),
    replaceValue: z.string()
  }),
  execute: (args) => {
    const filePath = resolveFilePath(args.filePath);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${args.filePath}`);
    let content = fs.readFileSync(filePath, "utf-8");
    if (!content.includes(args.searchValue)) throw new Error("The searchValue was not found in the file.");
    content = content.split(args.searchValue).join(args.replaceValue);
    fs.writeFileSync(filePath, content, "utf-8");
    return { success: true, message: `Replaced all occurrences in ${args.filePath}` };
  }
});

ToolRegistry.register({
  name: "search_files",
  description: "Searches for an exact string pattern across all files in a directory (ignores node_modules/.git). Returns a list of absolute paths with the matched line. Good for finding hardcoded variables or exact function calls.",
  schema: z.object({
    dirPath: z.string(),
    pattern: z.string(),
    isCaseSensitive: z.boolean().optional()
  }),
  execute: (args) => {
    const dir = path.resolve(args.dirPath);
    if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${args.dirPath}`);
    return { success: true, results: searchFilesHelper(dir, args.pattern, args.isCaseSensitive ?? false) };
  }
});

ToolRegistry.register({
  name: "patch_file",
  description: "Replaces a specific range of lines in a file with new content. StartLine and EndLine are 1-indexed and INCLUSIVE. This is the BEST and SAFEST tool for targeted refactors or minor edits inside large files.",
  dangerous: true,
  schema: z.object({
    filePath: z.string().describe("EXACT ABSOLUTE path to the file"),
    startLine: z.number().describe("The 1-indexed starting line number (inclusive)"),
    endLine: z.number().describe("The 1-indexed ending line number (inclusive)"),
    content: z.string().describe("The new content to insert")
  }),
  execute: (args) => {
    const filePath = resolveFilePath(args.filePath);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${args.filePath}`);
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

ToolRegistry.register({
  name: "multi_replace_in_file",
  description: "Replaces multiple non-contiguous line ranges in a file. Allows you to make surgical edits across different parts of a file without rewriting it all. WARNING: Do not overlap line ranges. The tool automatically sorts them bottom-to-top to prevent line shifting.",
  dangerous: true,
  schema: z.object({
    filePath: z.string().describe("EXACT ABSOLUTE path to the file"),
    replacements: z.array(z.object({
      startLine: z.number().describe("The 1-indexed starting line number (inclusive)"),
      endLine: z.number().describe("The 1-indexed ending line number (inclusive)"),
      content: z.string().describe("The new content to insert")
    })).describe("List of chunks to replace.")
  }),
  execute: (args) => {
    const filePath = resolveFilePath(args.filePath);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${args.filePath}`);
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

ToolRegistry.register({
  name: "analyze_codebase",
  description: "Semantically analyzes a file or directory to extract ONLY its structure (class signatures, function exports, interfaces). Extremely lightweight. Use this before editing a file if you just want to know its public API.",
  schema: z.object({ path: z.string() }),
  execute: (args) => {
    const targetPath = resolveFilePath(args.path);
    if (!fs.existsSync(targetPath)) throw new Error(`Path not found: ${args.path}`);
    let results: string[] = [];
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
    } else {
      results = extractSignatures(fs.readFileSync(targetPath, "utf-8"), targetPath);
    }
    return { success: true, analysis: results.length === 0 ? "No structures found." : results.join('\n') };
  }
});

ToolRegistry.register({
  name: "web_search",
  description: "Searches the web using DuckDuckGo",
  schema: z.object({ query: z.string() }),
  execute: async (args) => {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const searchResults: any[] = [];
    $('.result').each((i, el) => {
      if (i >= 5) return;
      const title = $(el).find('.result__title').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const rawUrl = $(el).find('.result__url').attr('href') || "";
      let cleanUrl = rawUrl;
      if (cleanUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
        cleanUrl = decodeURIComponent(cleanUrl.split('uddg=')[1].split('&')[0]);
      } else if (cleanUrl.startsWith('/url?q=')) {
        cleanUrl = decodeURIComponent(cleanUrl.split('/url?q=')[1].split('&')[0]);
      }
      if (title && cleanUrl) searchResults.push({ title, snippet, url: cleanUrl });
    });
    return { success: true, results: searchResults };
  }
});

ToolRegistry.register({
  name: "fetch_url",
  description: "Fetches a URL and extracts clean text",
  schema: z.object({ url: z.string() }),
  execute: async (args) => {
    const response = await fetch(args.url);
    const html = await response.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, svg, img, video, audio, iframe, nav, footer, header').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return { success: true, text: text.substring(0, 8000) };
  }
});

ToolRegistry.register({
  name: "start_background_command",
  description: "Starts a background command. Returns immediately.",
  schema: z.object({
    command: z.string(),
    id: z.string(),
    cwd: z.string().optional()
  }),
  execute: (args) => {
    if (backgroundProcesses[args.id]) throw new Error(`Process '${args.id}' is already running.`);
    const options = args.cwd ? { cwd: path.resolve(args.cwd), shell: true } : { shell: true };
    const child = spawn(args.command, [], options);
    backgroundProcesses[args.id] = { process: child, logs: [], command: args.command, status: "running" };
    const handleOutput = (data: any) => {
      const proc = backgroundProcesses[args.id];
      if (proc) {
        proc.logs.push(...data.toString().split('\n'));
        if (proc.logs.length > 500) proc.logs = proc.logs.slice(-500);
      }
    };
    child.stdout?.on('data', handleOutput);
    child.stderr?.on('data', handleOutput);
    child.on('close', (code) => {
      if (backgroundProcesses[args.id]) {
         backgroundProcesses[args.id].logs.push(`[Process exited with code ${code}]`);
         backgroundProcesses[args.id].status = "exited";
      }
    });
    return { success: true, message: `Process '${args.id}' started successfully.` };
  }
});

ToolRegistry.register({
  name: "read_process_logs",
  description: "Reads the recent logs of a background process.",
  schema: z.object({ id: z.string(), lines: z.number().optional() }),
  execute: (args) => {
    const proc = backgroundProcesses[args.id];
    if (!proc) throw new Error(`No running process found with id '${args.id}'.`);
    const logLines = proc.logs.slice(-(args.lines ?? 100));
    return { success: true, logs: logLines.join('\n') };
  }
});

ToolRegistry.register({
  name: "stop_background_process",
  description: "Stops a running background process.",
  schema: z.object({ id: z.string() }),
  execute: (args) => {
    const proc = backgroundProcesses[args.id];
    if (!proc) throw new Error(`No running process found with id '${args.id}'.`);
    proc.process.kill();
    proc.status = "killed";
    return { success: true, message: `Process '${args.id}' stopped.` };
  }
});

ToolRegistry.register({
  name: "finish_task",
  description: "Call this when the task is fully completed. Provide your comprehensive final answer or summary to the user in the finalAnswer field.",
  schema: z.object({ finalAnswer: z.string().describe("Your final textual answer, report, or summary.") }),
  execute: () => {
    return { success: true, message: "Task marked as completed." };
  }
});

ToolRegistry.register({
  name: "request_user_approval",
  description: "Use this tool to present a complex implementation plan to the user BEFORE executing code changes. This is mandatory for refactors, new features, or multi-file edits.",
  schema: z.object({
    planTitle: z.string(),
    planDescription: z.string().describe("A detailed, multi-line string explaining what files you will change and why.")
  }),
  execute: async (args) => {
    console.log(pc.magenta(`\n=== PLANO DE IMPLEMENTAÇÃO: ${args.planTitle} ===`));
    console.log(pc.white(args.planDescription));
    
    const approved = await confirmAction(pc.bold(pc.yellow("O usuário aprova o plano acima?")), false);
    if (approved) {
      return { success: true, message: "User approved the plan. Proceed with execution using the appropriate tools." };
    } else {
      return { success: false, error: "User REJECTED the plan. Ask the user for feedback and revise the plan before continuing." };
    }
  }
});

ToolRegistry.register({
  name: "invoke_subagent",
  description: "Delegates a complex research or read-only task to a subagent. The subagent runs in a fresh, isolated context and returns its final answer. Use this for fan-out tasks to keep your main context clean.",
  schema: z.object({
    task: z.string().describe("The highly detailed instructions for the subagent, including what exactly it should return."),
    persona: z.enum(['generic', 'reviewer', 'qa', 'researcher']).optional().describe("The specialized role for this subagent. Use generic for standard subagents, reviewer for code audits, qa for writing tests, researcher for docs/RAG.")
  }),
  execute: async (args) => {
    // Dynamic import to avoid circular dependency with Agent class
    const { Agent } = await import("./agent");
    const subHistoryFile = `.agent_history_sub_${Date.now()}.json`;
    const persona = args.persona || "generic";
    console.log(pc.magenta(`\n[Multi-Agente] Iniciando subagente [Persona: ${persona.toUpperCase()}] para a tarefa: ${args.task.substring(0, 50)}...`));
    
    // Instantiate subagent with smaller limits
    const subAgent = new Agent(subHistoryFile, 15, 10, true, persona);
    
    try {
      const result = await subAgent.runStep(args.task);
      console.log(pc.magenta(`[Multi-Agente] Subagente finalizou a tarefa.`));
      return { success: true, subagentAnswer: result || "The subagent completed its execution but did not return any finalAnswer text. It might have hit the maximum iterations limit or forgot to include the message." };
    } catch (e: any) {
      return { success: false, error: `Subagent failed: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "browser_navigate",
  description: "Navigate the active browser session to a URL.",
  schema: z.object({ url: z.string() }),
  execute: async (args) => {
    try {
      const { browserSession } = await import("./browserSession");
      const page = await browserSession.init();
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return await browserSession.extractState();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
});

ToolRegistry.register({
  name: "browser_click",
  description: "Click an element in the browser using a CSS selector.",
  schema: z.object({ selector: z.string() }),
  execute: async (args) => {
    try {
      const { browserSession } = await import("./browserSession");
      if (!browserSession.page) return { success: false, error: "Browser not initialized. Use browser_navigate first." };
      await browserSession.page.click(args.selector, { timeout: 5000 });
      await browserSession.page.waitForTimeout(1000); // Wait for potential animations/loads
      return await browserSession.extractState();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
});

ToolRegistry.register({
  name: "browser_type",
  description: "Type text into an input field in the browser.",
  schema: z.object({ selector: z.string(), text: z.string() }),
  execute: async (args) => {
    try {
      const { browserSession } = await import("./browserSession");
      if (!browserSession.page) return { success: false, error: "Browser not initialized. Use browser_navigate first." };
      await browserSession.page.fill(args.selector, args.text, { timeout: 5000 });
      return await browserSession.extractState();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
});

ToolRegistry.register({
  name: "browser_extract",
  description: "Captures the current state of the browser (text and screenshot).",
  schema: z.object({}),
  execute: async () => {
    try {
      const { browserSession } = await import("./browserSession");
      if (!browserSession.page) return { success: false, error: "Browser not initialized." };
      return await browserSession.extractState();
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
});

ToolRegistry.register({
  name: "invoke_browser_subagent",
  description: "Delegates a web automation/QA task to a specialized browser subagent. Use this for testing UI or scraping data. E.g. 'Test the login flow at http://localhost:3000'.",
  schema: z.object({
    task: z.string().describe("The comprehensive web task description for the subagent to perform.")
  }),
  execute: async (args) => {
    try {
      const { Agent } = await import("./agent");
      const { browserSession } = await import("./browserSession");
      console.log(pc.cyan(`\n[Browser Subagent] Delegating web task: "${args.task}"`));
      
      const subagent = new Agent(".agent_browser_history.json", 15, 10, true, "browser");
      const finalAnswer = await subagent.runStep(`You are a Browser Subagent. Complete this task using browser_ tools: ${args.task}\n\nWhen done, use finish_task to return the final answer. DO NOT modify files.`);
      
      // Cleanup browser after subagent finishes
      await browserSession.close();
      
      return { success: true, report: finalAnswer };
    } catch (e: any) {
      return { success: false, error: `Browser subagent failed: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "semantic_search",
  description: "Performs RAG semantic search across the entire codebase using natural language. BEST for understanding architecture or finding where a feature is implemented without knowing exact file names. Examples: 'Onde o banco é inicializado?', 'How is user authentication handled?'.",
  schema: z.object({
    query: z.string().describe("Natural language query to search for in the codebase")
  }),
  execute: async (args) => {
    try {
      const { search } = await import("./rag");
      console.log(pc.cyan(`\n[RAG] Buscando por: "${args.query}"...`));
      const result = await search(args.query);
      return { success: true, results: result };
    } catch (e: any) {
      return { success: false, error: `Semantic search failed: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "create_pull_request",
  description: "Creates a new Git branch, commits all modified files, and provides instructions/commands to open a Pull Request. Use this after fixing a bug or implementing a feature to finalize the GitOps cycle.",
  schema: z.object({
    branchName: z.string().describe("The name of the new branch to create (e.g., fix-login-security)"),
    commitMessage: z.string().describe("The commit message explaining the fix. MUST start with feat:, fix:, chore:, docs:, refactor:, test:, style:, or build:"),
    prTitle: z.string().describe("The title of the Pull Request"),
    prBody: z.string().describe("The description body of the Pull Request")
  }),
  execute: async (args) => {
    try {
      const { execSync } = require('child_process');
      console.log(pc.magenta(`\n[GitOps] Iniciando ciclo de CI/CD para a branch '${args.branchName}'...`));
      
      const semanticRegex = /^(feat|fix|chore|docs|refactor|test|style|build|ci|perf)(\([a-z0-9\-]+\))?:\s.+/i;
      if (!semanticRegex.test(args.commitMessage)) {
        return { success: false, error: "Validation Error: commitMessage MUST follow Conventional Commits (e.g., 'feat: added login', 'fix: correct typo'). Please rewrite your commit message." };
      }

      execSync(`git checkout -b ${args.branchName}`);
      console.log(pc.green(`✔ Branch '${args.branchName}' criada com sucesso.`));

      execSync(`git add .`);
      
      execSync(`git commit -m "${args.commitMessage}"`);
      console.log(pc.green(`✔ Commit realizado: "${args.commitMessage}"`));

      console.log(pc.cyan(`[GitOps] Realizando push para origin/${args.branchName}...`));
      const pushOutput = execSync(`git push -u origin ${args.branchName} 2>&1`, { encoding: 'utf8' });
      console.log(pc.green(`✔ Push realizado com sucesso.`));

      let prUrl = "";
      const urlMatch = pushOutput.match(/https:\/\/(?:github\.com|gitlab\.com)[^\s]*/);
      if (urlMatch) {
          prUrl = urlMatch[0];
      }

      const finalReport = `
GitOps concluído com sucesso e enviado para o repositório remoto!
- Branch: ${args.branchName}
- Commit: ${args.commitMessage}
${prUrl ? `\n[LINK PARA CRIAR O PULL REQUEST]: ${prUrl}\nO desenvolvedor pode clicar neste link para abrir o PR no navegador.` : `\nPara criar o PR remotamente, rode: gh pr create --title "${args.prTitle}"`}
`;
      return { success: true, report: finalReport };
    } catch (e: any) {
      return { success: false, error: `GitOps failed: ${e.message}. Certifique-se de que não há conflitos ou que o repositório está inicializado.` };
    }
  }
});

ToolRegistry.register({
  name: "create_artifact",
  description: "Creates a markdown artifact to store long reports, analysis, or structured documents instead of cluttering the terminal. Returns the path of the created file.",
  schema: z.object({
    title: z.string().describe("A short, URL-friendly title for the artifact (e.g. 'architecture-analysis')"),
    content: z.string().describe("The markdown content to save")
  }),
  execute: (args) => {
    const artifactDir = path.resolve(".agent_artifacts");
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const safeTitle = args.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filePath = path.join(artifactDir, `${safeTitle}.md`);
    fs.writeFileSync(filePath, args.content, "utf-8");
    console.log(pc.green(`\n📝 Artefato criado: ${filePath}`));
    agentEvents.emit("open_artifact", filePath);
    return { success: true, message: `Artifact saved to ${filePath}` };
  }
});

ToolRegistry.register({
  name: "manage_tasks",
  description: "Creates or updates a task checklist artifact (task.md). Use this to keep track of progress. Content should be a markdown checklist like: - [ ] Task 1. Then you can update it to - [x] Task 1.",
  schema: z.object({
    content: z.string().describe("The full markdown content of the task list.")
  }),
  execute: (args) => {
    const artifactDir = path.resolve(".agent_artifacts");
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const filePath = path.join(artifactDir, `task.md`);
    fs.writeFileSync(filePath, args.content, "utf-8");
    console.log(pc.green(`\n✅ Lista de tarefas atualizada: ${filePath}`));
    agentEvents.emit("open_artifact", filePath);
    return { success: true, message: `Task list saved to ${filePath}` };
  }
});

ToolRegistry.register({
  name: "list_skills",
  description: "Lists all available dynamic skills and guidelines in the skills/ directory. Use this to find project-specific rules before writing code.",
  schema: z.object({}),
  execute: () => {
    const skillsDir = path.resolve("skills");
    if (!fs.existsSync(skillsDir)) return { success: true, skills: "No skills found." };
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith(".md"));
    if (files.length === 0) return { success: true, skills: "No skills found." };
    
    const skillsList = files.map(f => {
       const content = fs.readFileSync(path.join(skillsDir, f), "utf-8");
       const firstLine = content.split('\n')[0].replace('#', '').trim();
       return `- ${f}: ${firstLine}`;
    }).join('\n');
    
    return { success: true, message: `Available skills:\n${skillsList}\n\nUse read_file to read the content of a relevant skill.` };
  }
});

ToolRegistry.register({
  name: "preview_file_changes",
  description: "Proposes changes to a file and opens a native Diff viewer in the user's IDE. Use this BEFORE applying large or risky changes so the user can review them. After calling this, you should typically call request_user_approval.",
  schema: z.object({
    filePath: z.string().describe("Absolute path to the original file"),
    proposedContent: z.string().describe("The new content to replace the original with")
  }),
  execute: (args) => {
    const originalPath = resolveFilePath(args.filePath);
    if (!fs.existsSync(originalPath)) throw new Error(`File not found: ${args.filePath}`);
    
    const artifactDir = path.resolve(".agent_artifacts");
    if (!fs.existsSync(artifactDir)) {
      fs.mkdirSync(artifactDir, { recursive: true });
    }
    const fileName = path.basename(originalPath);
    const proposedPath = path.join(artifactDir, `preview_${fileName}`);
    
    fs.writeFileSync(proposedPath, args.proposedContent, "utf-8");
    console.log(pc.yellow(`\n🔍 Abrindo preview de diff para: ${fileName}`));
    
    agentEvents.emit("open_diff", { originalPath, proposedPath });
    
    return { success: true, message: `Diff preview opened for ${originalPath} vs ${proposedPath}. Wait for user feedback or call request_user_approval.` };
  }
});

ToolRegistry.register({
  name: "run_sandboxed_command",
  description: "Runs a shell command inside an ephemeral Docker container. Use this to safely execute generated python code or run untrusted commands. The workspace is mounted.",
  dangerous: true,
  schema: z.object({
    image: z.string().optional().describe("The docker image to use (e.g. 'python:3.10', 'node:20')"),
    command: z.string().describe("The command to execute inside the container")
  }),
  execute: async (args) => {
    try {
      const { exec } = require('child_process');
      const util = require('util');
      const execAsync = util.promisify(exec);
      
      console.log(pc.yellow(`\n[Sandbox] Executando comando em container Docker (${args.image})...`));
      
      const cwd = process.cwd();
      const safeCommand = args.command.replace(/"/g, '\\"');
      const dockerImage = args.image ?? "node:20";
      const dockerCommand = `docker run --rm -v "${cwd}:/workspace" -w /workspace ${dockerImage} bash -c "${safeCommand}"`;
      
      const { stdout, stderr } = await execAsync(dockerCommand);
      return { success: true, stdout, stderr };
    } catch (e: any) {
      return { success: false, error: e.message, stderr: e.stderr };
    }
  }
});

ToolRegistry.register({
  name: "memorize",
  description: "Saves a rule, learning, or preference to your long-term vector memory. Use this proactively to remember user preferences or project gotchas for future sessions.",
  schema: z.object({
    content: z.string().describe("The text to remember. E.g. 'Always use camelCase for variables in this project.'")
  }),
  execute: async (args) => {
    try {
      const { remember } = await import("./memoryVector");
      await remember(args.content);
      return { success: true, message: "Saved to long-term memory." };
    } catch (e: any) {
      return { success: false, error: `Failed to memorize: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "save_knowledge_item",
  description: "Saves a Markdown file containing important learned lessons, rules, or architectural decisions about this repository. Use this to permanently store knowledge that will be useful in future sessions.",
  schema: z.object({
    topicName: z.string().describe("A short, dash-separated filename for the topic (e.g. 'auth-rules')"),
    content: z.string().describe("The markdown content of the knowledge item")
  }),
  execute: (args) => {
    const knowledgeDir = path.resolve(".agent_artifacts", "knowledge");
    if (!fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true });
    }
    const safeName = args.topicName.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    const filePath = path.join(knowledgeDir, `${safeName}.md`);
    fs.writeFileSync(filePath, args.content, "utf-8");
    return { success: true, message: `Knowledge item saved to ${filePath}` };
  }
});

ToolRegistry.register({
  name: "list_knowledge_items",
  description: "Lists all permanently saved knowledge items in the repository. Use this to discover context about the project's architecture, rules, or past bugs.",
  schema: z.object({}),
  execute: () => {
    const knowledgeDir = path.resolve(".agent_artifacts", "knowledge");
    if (!fs.existsSync(knowledgeDir)) {
      return { success: true, message: "No knowledge items found.", files: [] };
    }
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith(".md"));
    return { success: true, files: files.map(f => path.join(knowledgeDir, f)) };
  }
});

ToolRegistry.register({
  name: "invoke_parallel_subagents",
  description: "Delega um array de tarefas para N sub-agentes rodarem em PARALELO simultaneamente. Use isso APENAS quando as tarefas alterarem arquivos DIFERENTES.",
  schema: z.object({
    tasks: z.array(z.string()).describe("Lista de prompts com instruções e caminhos absolutos de arquivos para cada sub-agente.")
  }),
  execute: async (args) => {
    const { tasks } = args;
    if (!tasks || tasks.length === 0) return { success: false, error: "Nenhuma tarefa." };
    if (tasks.length > 5) return { success: false, error: "Máximo 5 sub-agentes." };

    try {
      const { ChatOpenAI } = await import("@langchain/openai");
      const { SystemMessage, HumanMessage, ToolMessage } = await import("@langchain/core/messages");

      const runSubagent = async (task: string, index: number) => {
        agentEvents.emit("system", `\n🚀 Sub-Agente [${index+1}] Iniciado: "${task.substring(0,50)}..."\n`);
        const chat = new ChatOpenAI({
          modelName: process.env.LLM_MODEL || "qwen-35b-turboquant",
          temperature: 0.1,
          maxTokens: 4096,
          apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "dummy",
          configuration: { baseURL: process.env.LLM_BASE_URL || "http://127.0.0.1:18080/v1" }
        });

        const schemas = ToolRegistry.getSchemas();
        const chatWithTools = chat.bindTools(schemas);
        const messages: any[] = [
           new SystemMessage(`Você é um Sub-Agente Especialista. Execute a tarefa O MAIS RÁPIDO POSSÍVEL. Quando terminar, chame finish_task.`),
           new HumanMessage(task)
        ];

        let iter = 0;
        while (iter < 8) {
           iter++;
           const response: any = await chatWithTools.invoke(messages);
           messages.push(response);
           if (!response.tool_calls || response.tool_calls.length === 0) break;

           for (const call of response.tool_calls) {
              const toolName = call.name;
              if (toolName === "finish_task") return `Sub-Agente [${index+1}] Sucesso.`;
              if (toolName === "invoke_parallel_subagents") {
                 messages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: "Proibido." }));
                 continue;
              }

              let toolResult;
              try {
                toolResult = await ToolRegistry.execute(toolName, call.args);
              } catch (e: any) {
                toolResult = { success: false, error: e.message };
              }
              messages.push(new ToolMessage({ tool_call_id: call.id || "0", name: toolName, content: JSON.stringify(toolResult).substring(0,1000) }));
           }
        }
        return `Sub-Agente [${index+1}] parou.`;
      };

      const results = await Promise.all(tasks.map((task, i) => runSubagent(task, i)));
      return { success: true, results };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
});

ToolRegistry.register({
  name: "query_sqlite",
  description: "Executes a READ-ONLY SQL query against a local SQLite database file (.db or .sqlite). Useful to audit or extract data directly.",
  schema: z.object({
    dbPath: z.string().describe("The absolute or relative path to the SQLite database file"),
    query: z.string().describe("The SQL query to execute (e.g. SELECT * FROM users, PRAGMA table_info(logs))")
  }),
  execute: (args) => {
    try {
      // Lazy load to avoid slowing down startup
      const Database = require('better-sqlite3');
      
      const dbPath = path.resolve(args.dbPath);
      if (!fs.existsSync(dbPath)) {
        return { success: false, error: `Database file not found at ${dbPath}` };
      }

      // Open in Read-Only mode for safety
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      
      try {
        const stmt = db.prepare(args.query);
        let rows = [];
        // better-sqlite3 throws if you try to run .all() on statements that don't return data
        if (stmt.reader) {
           rows = stmt.all();
        } else {
           stmt.run(); // Should fail if it's an UPDATE/INSERT and db is readonly
        }
        db.close();
        
        return { success: true, result: rows };
      } catch (err: any) {
        db.close();
        return { success: false, error: `Query failed: ${err.message}` };
      }
    } catch (e: any) {
      return { success: false, error: `SQLite connection failed: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "run_unit_tests",
  description: "Executa a suíte de testes unitários (ex: vitest run) e retorna o resultado. Use para verificar se o código não quebrou nada ou se o novo teste escrito passou.",
  schema: z.object({
    testFile: z.string().optional().describe("Caminho do arquivo de teste específico para rodar. Deixe em branco para rodar todos os testes.")
  }),
  execute: (args) => {
    try {
      const { execSync } = require('child_process');
      const command = args.testFile ? `npx vitest run ${args.testFile}` : `npx vitest run`;
      
      console.log(require('picocolors').cyan(`\n[QA] Executando testes: ${command}`));
      const output = execSync(command, { encoding: 'utf8', stdio: 'pipe' });
      
      return { success: true, result: output };
    } catch (e: any) {
      // execSync throws se o comando falhar (exit code != 0), o stdout/stderr vem no erro
      const errorLog = e.stdout ? e.stdout.toString() : e.message;
      return { success: false, error: `Tests failed!\n${errorLog}` };
    }
  }
});

// --- FASE 17: OS Integration Tools ---

ToolRegistry.register({
  name: "send_notification",
  description: "Envia uma notificação nativa para a área de trabalho do usuário (Desktop). Use para avisar que uma tarefa demorada terminou ou para enviar alertas.",
  schema: z.object({
    title: z.string().describe("Título da notificação"),
    message: z.string().describe("Corpo da mensagem da notificação")
  }),
  execute: async (args) => {
    try {
      const notifier = require('node-notifier');
      notifier.notify({
        title: args.title || 'Turbo Agent',
        message: args.message,
        sound: true,
        wait: false
      });
      return { success: true, message: "Notificação enviada." };
    } catch (e: any) {
      return { success: false, error: `Falha ao enviar notificação: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "clipboard_manager",
  description: "Lê ou escreve texto na área de transferência (Clipboard) do sistema operacional do usuário. Útil se o usuário disser 'corrige o código que copiei'.",
  schema: z.object({
    action: z.enum(["read", "write"]).describe("Ação: read (ler) ou write (escrever)"),
    text: z.string().optional().describe("Texto para escrever no clipboard (apenas para write)")
  }),
  execute: async (args) => {
    try {
      const clipboardy = await import('clipboardy');
      if (args.action === "read") {
        const text = clipboardy.default.readSync();
        return { success: true, text };
      } else {
        if (!args.text) return { success: false, error: "Text is required for write action" };
        clipboardy.default.writeSync(args.text);
        return { success: true, message: "Texto copiado para a área de transferência." };
      }
    } catch (e: any) {
      return { success: false, error: `Falha no clipboard: ${e.message}. Note que em Linux remoto (SSH/WSL) pode não funcionar.` };
    }
  }
});

ToolRegistry.register({
  name: "open_browser",
  description: "Abre o navegador padrão do sistema operacional em uma URL específica ou abre um arquivo local no navegador.",
  schema: z.object({
    url: z.string().describe("A URL ou caminho do arquivo para abrir")
  }),
  execute: async (args) => {
    try {
      const open = require('open');
      await open(args.url);
      return { success: true, message: `Navegador aberto em: ${args.url}` };
    } catch (e: any) {
      return { success: false, error: `Falha ao abrir navegador: ${e.message}` };
    }
  }
});

ToolRegistry.register({
  name: "system_stats",
  description: "Retorna estatísticas do Hardware local: Uso de CPU, Memória Livre/Total, e Disco. Útil para diagnósticos de gargalos.",
  schema: z.object({}),
  execute: async () => {
    try {
      const si = require('systeminformation');
      const cpu = await si.currentLoad();
      const mem = await si.mem();
      
      const stats = {
        cpuLoadPercent: cpu.currentLoad.toFixed(2) + "%",
        memoryTotalGB: (mem.total / 1024 / 1024 / 1024).toFixed(2),
        memoryUsedGB: (mem.used / 1024 / 1024 / 1024).toFixed(2),
        memoryFreeGB: (mem.free / 1024 / 1024 / 1024).toFixed(2)
      };
      
      return { success: true, stats };
    } catch (e: any) {
      return { success: false, error: `Falha ao obter stats do sistema: ${e.message}` };
    }
  }
});

// --- FASE 18: Memória de Longo Prazo ---

ToolRegistry.register({
  name: "add_core_rule",
  description: "Adiciona uma regra inquebrável à memória core permanente do agente (ex: padrões de código, uso de bibliotecas, tom de voz). Essa regra será injetada no System Prompt de todas as execuções futuras. Use isso para regras críticas de arquitetura.",
  schema: z.object({
    rule: z.string().describe("A regra arquitetural ou de estilo a ser obedecida permanentemente.")
  }),
  execute: async (args) => {
    try {
      const { CoreMemory } = await import("./coreMemory");
      CoreMemory.addRule(args.rule);
      return { success: true, message: "Regra adicionada à Core Memory com sucesso." };
    } catch (e: any) {
      return { success: false, error: `Falha ao adicionar Core Rule: ${e.message}` };
    }
  }
});
