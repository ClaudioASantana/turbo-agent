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

export function extractToolCalls(response: string): any | null {
  // 0. Remove <think>...</think> blocks completely so they don't interfere with JSON parsing
  const cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, "");

  try {
    // 1. Try native parse first in case it's perfectly clean
    return tryParse(cleanResponse);
  } catch (e) {
    // 2. Look for JSON markdown blocks ```json ... ```
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = markdownRegex.exec(cleanResponse)) !== null) {
      try {
        return tryParse(match[1]);
      } catch (err) {
        continue; // Try next block if parsing fails
      }
    }

    // 3. Look for the first { and last } as a fallback
    const start = cleanResponse.indexOf("{");
    const end = cleanResponse.lastIndexOf("}");
    if (start !== -1 && end !== -1 && start < end) {
      const jsonString = cleanResponse.substring(start, end + 1);
      try {
        return tryParse(jsonString);
      } catch (err) {
        // give up
      }
    }
  }

  return null;
}
