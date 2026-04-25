import * as fs from "fs";
import * as path from "path";
import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import * as cheerio from "cheerio";

const execPromise = promisify(exec);

export const backgroundProcesses: Record<string, { process: ChildProcess, logs: string[] }> = {};

// Helper to find a file recursively if the given path doesn't strictly exist
function resolveFilePath(targetPath: string, rootDir: string = "."): string {
  const absolutePath = path.resolve(targetPath);
  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }
  
  // If it doesn't exist, search for it by filename
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

export interface ToolDef {
  name: string;
  description: string;
  parameters: object;
}

export const availableTools: ToolDef[] = [
  {
    name: "read_file",
    description: "Reads the content of a file",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or relative path to the file" },
      },
      required: ["filePath"],
    },
  },
  {
    name: "list_files",
    description: "Lists files in a directory",
    parameters: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "Directory path to list" },
      },
      required: ["dirPath"],
    },
  },
  {
    name: "write_file",
    description: "Writes content to a file (creates or overwrites it)",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or relative path to the file" },
        content: { type: "string", description: "The content to write" },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "run_command",
    description: "Executes a command in the terminal",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The terminal command to execute" },
        cwd: { type: "string", description: "Optional current working directory for the command" },
      },
      required: ["command"],
    },
  },
  {
    name: "replace_in_file",
    description: "Replaces all exact occurrences of a string in a file.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute or relative path to the file" },
        searchValue: { type: "string", description: "The exact string to find and replace" },
        replaceValue: { type: "string", description: "The new string to insert" }
      },
      required: ["filePath", "searchValue", "replaceValue"]
    }
  },
  {
    name: "search_files",
    description: "Searches for a string across files in a directory, ignoring node_modules and .git. Returns a list of matches with ABSOLUTE paths and line numbers. IMPORTANT: Always use the exact absolute path returned by this tool when using other tools like read_file or patch_file.",
    parameters: {
      type: "object",
      properties: {
        dirPath: { type: "string", description: "The directory to search in" },
        pattern: { type: "string", description: "The string to search for" },
        isCaseSensitive: { type: "boolean", description: "Whether the search should be case sensitive. Defaults to false." }
      },
      required: ["dirPath", "pattern"]
    }
  },
  {
    name: "finish_task",
    description: "Call this when the task is fully completed to report the final answer to the user.",
    parameters: {
      type: "object",
      properties: {
        finalAnswer: { type: "string", description: "The final answer or summary of what was done" },
      },
      required: ["finalAnswer"],
    },
  },
  {
    name: "web_search",
    description: "Searches the web using DuckDuckGo and returns a list of URLs and snippets",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"]
    }
  },
  {
    name: "fetch_url",
    description: "Fetches a URL and extracts clean text from the HTML, removing scripts and styles",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"]
    }
  },
  {
    name: "start_background_command",
    description: "Starts a background command (e.g. npm run dev). Returns immediately with a process ID.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The terminal command to execute" },
        id: { type: "string", description: "A unique ID for this process (e.g., 'dev-server')" },
        cwd: { type: "string", description: "Optional working directory" }
      },
      required: ["command", "id"]
    }
  },
  {
    name: "read_process_logs",
    description: "Reads the recent logs (stdout/stderr) of a background process.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the process" },
        lines: { type: "number", description: "Number of recent lines to read. Defaults to 100." }
      },
      required: ["id"]
    }
  },
  {
    name: "stop_background_process",
    description: "Stops a running background process.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ID of the process" }
      },
      required: ["id"]
    }
  },
  {
    name: "patch_file",
    description: "Replaces a specific range of lines in a file with new content. Useful for large refactors where replace_in_file is insufficient.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "EXACT ABSOLUTE path to the file" },
        startLine: { type: "number", description: "The 1-indexed starting line number to replace (inclusive)" },
        endLine: { type: "number", description: "The 1-indexed ending line number to replace (inclusive)" },
        content: { type: "string", description: "The new content to insert in place of the specified lines" }
      },
      required: ["filePath", "startLine", "endLine", "content"]
    }
  },
  {
    name: "analyze_codebase",
    description: "Semantically analyzes a file or directory to extract only the structure (functions, classes, interfaces, exports). Use this to explore a codebase quickly without wasting context window on full file contents.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file or directory to analyze" }
      },
      required: ["path"]
    }
  }
];

function extractSignatures(content: string, filename: string): string[] {
  const signatures: string[] = [];
  const lines = content.split('\n');
  
  // Basic semantic regexes for TS/JS
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

export async function executeTool(toolName: string, args: any): Promise<any> {
  switch (toolName) {
    case "read_file":
      try {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath)) {
          return { success: false, error: `File not found: ${args.filePath}` };
        }
        const content = fs.readFileSync(filePath, "utf-8");
        return { success: true, content };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "list_files":
      try {
        const files = fs.readdirSync(path.resolve(args.dirPath));
        return { success: true, files };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "write_file":
      try {
        const filePath = path.resolve(args.filePath); // Write always uses exact path
        fs.writeFileSync(filePath, args.content, "utf-8");
        return { success: true, message: `File ${args.filePath} written successfully.` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "replace_in_file":
      try {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath)) {
          return { success: false, error: `File not found: ${args.filePath}` };
        }
        let content = fs.readFileSync(filePath, "utf-8");
        if (!content.includes(args.searchValue)) {
           return { success: false, error: "The searchValue was not found in the file." };
        }
        content = content.split(args.searchValue).join(args.replaceValue);
        fs.writeFileSync(filePath, content, "utf-8");
        return { success: true, message: `Replaced all occurrences in ${args.filePath}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "patch_file":
      try {
        const filePath = resolveFilePath(args.filePath);
        if (!fs.existsSync(filePath)) {
          return { success: false, error: `File not found: ${args.filePath}` };
        }
        let content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split('\n');
        const startIdx = args.startLine - 1;
        const endIdx = args.endLine - 1;
        
        if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
            return { success: false, error: `Invalid line range. File has ${lines.length} lines.` };
        }

        const newLines = args.content.split('\n');
        lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
        
        fs.writeFileSync(filePath, lines.join('\n'), "utf-8");
        return { success: true, message: `Patched lines ${args.startLine} to ${args.endLine} in ${args.filePath}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "analyze_codebase":
      try {
        const targetPath = resolveFilePath(args.path);
        if (!fs.existsSync(targetPath)) {
          return { success: false, error: `Path not found: ${args.path}` };
        }
        
        let results: string[] = [];
        const stat = fs.statSync(targetPath);
        
        if (stat.isDirectory()) {
          const files = searchFilesHelper(targetPath, ""); // Quick way to get all files
          // Extract signatures from each file
          const uniqueFiles = [...new Set(files.map(f => f.split(':')[0]))];
          
          for (const file of uniqueFiles) {
            if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.tsx')) {
               const content = fs.readFileSync(file, "utf-8");
               const sigs = extractSignatures(content, file);
               if (sigs.length > 0) {
                 results.push(`\n--- ${file} ---`);
                 results.push(...sigs);
               }
            }
          }
        } else {
          const content = fs.readFileSync(targetPath, "utf-8");
          results = extractSignatures(content, targetPath);
        }
        
        if (results.length === 0) return { success: true, analysis: "No structures found." };
        return { success: true, analysis: results.join('\n') };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "run_command":
      try {
        const options = args.cwd ? { cwd: path.resolve(args.cwd) } : {};
        const { stdout, stderr } = await execPromise(args.command, options);
        return { success: true, stdout, stderr };
      } catch (e: any) {
        return { success: false, error: e.message, stdout: e.stdout, stderr: e.stderr };
      }
    case "search_files":
      try {
        const dir = path.resolve(args.dirPath);
        if (!fs.existsSync(dir)) {
          return { success: false, error: `Directory not found: ${args.dirPath}` };
        }
        const isCaseSensitive = args.isCaseSensitive || false;
        const results = searchFilesHelper(dir, args.pattern, isCaseSensitive);
        return { success: true, results };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "web_search":
      try {
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const searchResults: any[] = [];
        $('.result').each((i, el) => {
          if (i >= 5) return; // limit to 5 results
          const title = $(el).find('.result__title').text().trim();
          const snippet = $(el).find('.result__snippet').text().trim();
          const rawUrl = $(el).find('.result__url').attr('href') || "";
          
          let cleanUrl = rawUrl;
          if (cleanUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
              cleanUrl = decodeURIComponent(cleanUrl.split('uddg=')[1].split('&')[0]);
          } else if (cleanUrl.startsWith('/url?q=')) {
              cleanUrl = decodeURIComponent(cleanUrl.split('/url?q=')[1].split('&')[0]);
          }

          if (title && cleanUrl) {
            searchResults.push({ title, snippet, url: cleanUrl });
          }
        });
        return { success: true, results: searchResults };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "fetch_url":
      try {
        const response = await fetch(args.url);
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Remove useless tags
        $('script, style, noscript, svg, img, video, audio, iframe, nav, footer, header').remove();
        
        // Extract text and clean up whitespace
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        return { success: true, text: text.substring(0, 8000) }; // limit to 8k chars to avoid token limits
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "start_background_command":
      try {
        if (backgroundProcesses[args.id]) {
          return { success: false, error: `A process with id '${args.id}' is already running.` };
        }
        const options = args.cwd ? { cwd: path.resolve(args.cwd), shell: true } : { shell: true };
        const child = spawn(args.command, [], options);
        
        backgroundProcesses[args.id] = { process: child, logs: [] };
        
        const handleOutput = (data: any) => {
           const lines = data.toString().split('\n');
           const proc = backgroundProcesses[args.id];
           if (proc) {
             proc.logs.push(...lines);
             if (proc.logs.length > 500) {
               proc.logs = proc.logs.slice(proc.logs.length - 500);
             }
           }
        };

        child.stdout?.on('data', handleOutput);
        child.stderr?.on('data', handleOutput);
        
        child.on('close', (code) => {
           const proc = backgroundProcesses[args.id];
           if (proc) proc.logs.push(`[Process exited with code ${code}]`);
        });

        return { success: true, message: `Process '${args.id}' started successfully.` };
      } catch (e: any) {
         return { success: false, error: e.message };
      }
    case "read_process_logs":
      try {
        const proc = backgroundProcesses[args.id];
        if (!proc) {
           return { success: false, error: `No running process found with id '${args.id}'.` };
        }
        const linesToRead = args.lines || 100;
        const logsToReturn = proc.logs.slice(-Math.abs(linesToRead));
        return { success: true, logs: logsToReturn.join('\n') };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "stop_background_process":
      try {
        const proc = backgroundProcesses[args.id];
        if (!proc) {
           return { success: false, error: `No running process found with id '${args.id}'.` };
        }
        proc.process.kill();
        delete backgroundProcesses[args.id];
        return { success: true, message: `Process '${args.id}' stopped and removed.` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    case "finish_task":
        return { success: true, message: "Task marked as completed." };
    default:
      return { success: false, error: `Tool ${toolName} not found.` };
  }
}
