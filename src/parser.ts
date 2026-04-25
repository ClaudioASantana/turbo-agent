/**
 * Safely extracts a JSON block from a string that might contain conversational text.
 * Qwen sometimes adds markdown formatting or conversational text around the JSON.
 */
export function extractToolCalls(response: string): any | null {
  // 0. Remove <think>...</think> blocks completely so they don't interfere with JSON parsing
  const cleanResponse = response.replace(/<think>[\s\S]*?<\/think>/g, "");

  try {
    // 1. Try native parse first in case it's perfectly clean
    return JSON.parse(cleanResponse);
  } catch (e) {
    // 2. Look for JSON markdown blocks ```json ... ```
    const markdownRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    let match;
    while ((match = markdownRegex.exec(cleanResponse)) !== null) {
      try {
        return JSON.parse(match[1]);
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
        return JSON.parse(jsonString);
      } catch (err) {
        // give up
      }
    }
  }

  return null;
}
