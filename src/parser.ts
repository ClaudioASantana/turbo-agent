/**
 * Safely extracts a JSON block from a string that might contain conversational text.
 * Qwen sometimes adds markdown formatting or conversational text around the JSON.
 */

function sanitizeJSONString(jsonStr: string): string {
    let inString = false;
    let escaped = false;
    let result = '';
    
    for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        
        if (char === '\\' && !escaped) {
            escaped = true;
            result += char;
            continue;
        }
        
        if (char === '"' && !escaped) {
            inString = !inString;
        }
        
        if (char === '\n' && inString) {
            result += '\\n';
        } else if (char === '\r' && inString) {
            result += '\\r';
        } else if (char === '\t' && inString) {
            result += '\\t';
        } else {
            result += char;
        }
        
        escaped = false;
    }
    
    return result;
}

function tryParse(str: string): any {
    try {
        return JSON.parse(str);
    } catch (e) {
        return JSON.parse(sanitizeJSONString(str));
    }
}

export function extractToolCalls(response: string): { id: string, name: string, args: any }[] | null {
  const cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, "");
  const toolCalls: { id: string, name: string, args: any }[] = [];
  const fakeId = "call_" + Math.random().toString(36).substring(2, 9);

  // Padrão Claude Proxy: <function=nome> { ... }
  const functionTagRegex = /<function=([^>]+)>\n?({[\s\S]+?})/g;
  let match;
  let found = false;

  while ((match = functionTagRegex.exec(cleanResponse)) !== null) {
    try {
      const name = match[1];
      const args = tryParse(match[2]);
      toolCalls.push({ id: fakeId, name, args });
      found = true;
    } catch (e) { }
  }

  if (found) return toolCalls;

  // Padrão Qwen Local (Ollama): JSON cru ou blocos markdown
  try {
    const directObj = tryParse(cleanResponse);
    if (directObj && typeof directObj === 'object' && !Array.isArray(directObj)) {
      // Formato exigido no prompt: { "tool": "nome", "args": {} }
      if (directObj.tool && directObj.args) {
         toolCalls.push({ id: fakeId, name: directObj.tool, args: directObj.args });
         return toolCalls;
      }
      
      // Tenta inferir o nome a partir da primeira chave (ex: { "finish_task": { "finalAnswer": "..." } })
      const keys = Object.keys(directObj);
      if (keys.length === 1 && typeof directObj[keys[0]] === 'object') {
         toolCalls.push({ id: fakeId, name: keys[0], args: directObj[keys[0]] });
         return toolCalls;
      }
    }
  } catch (e) { }

  const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
  while ((match = markdownRegex.exec(cleanResponse)) !== null) {
    try {
      const parsed = tryParse(match[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Formato exigido no prompt: { "tool": "nome", "args": {} }
        if (parsed.tool && parsed.args) {
           toolCalls.push({ id: fakeId, name: parsed.tool, args: parsed.args });
           return toolCalls;
        }

        const keys = Object.keys(parsed);
        if (keys.length === 1 && typeof parsed[keys[0]] === 'object') {
           toolCalls.push({ id: fakeId, name: keys[0], args: parsed[keys[0]] });
           return toolCalls;
        }
      }
    } catch (err) { }
  }

  // Fallback agressivo: buscar chaves JSON brutas em qualquer lugar do texto
  let braceCount = 0;
  let startIndex = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < cleanResponse.length; i++) {
      const char = cleanResponse[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
          if (char === '{') {
              if (braceCount === 0) startIndex = i;
              braceCount++;
          } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && startIndex !== -1) {
                  const block = cleanResponse.substring(startIndex, i + 1);
                  try {
                      const parsed = tryParse(block);
                      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                          if (parsed.tool && parsed.args) {
                              toolCalls.push({ id: fakeId, name: parsed.tool, args: parsed.args });
                              return toolCalls;
                          }
                          const keys = Object.keys(parsed);
                          if (keys.length === 1 && typeof parsed[keys[0]] === 'object') {
                              toolCalls.push({ id: fakeId, name: keys[0], args: parsed[keys[0]] });
                              return toolCalls;
                          }
                      }
                  } catch (e) {}
                  startIndex = -1;
              } else if (braceCount < 0) {
                  braceCount = 0;
              }
          }
      }
  }

  return toolCalls.length > 0 ? toolCalls : null;
}
