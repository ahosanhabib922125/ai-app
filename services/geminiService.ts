
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION, PRD_ANALYSIS_INSTRUCTION } from "../constants";
import { GeneratedFile, ChatMessage, PageAnalysisItem, PRDAnalysisResult } from "../types";

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface StreamUpdate {
  text: string;
  roadmap?: string[];
  newFile?: { name: string; content: string };
}

export const generateArchitectureStream = async function* (
  prompt: string,
  dna: string,
  attachmentFiles: File[],
  currentProjectFiles: Record<string, GeneratedFile> = {},
  chatHistory: ChatMessage[] = [],
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  
  // 1. Prepare Context from Attachments
  let attachmentContext = "";
  for (const file of attachmentFiles) {
    if (file.type.includes("text") || file.name.endsWith(".md") || file.name.endsWith(".html")) {
      const text = await file.text();
      attachmentContext += `\n[ATTACHMENT: ${file.name}]\n${text}\n`;
    }
  }

  // 2. Prepare Context from Current Project (For Modifications)
  let projectContext = "";
  const fileKeys = Object.keys(currentProjectFiles);
  if (fileKeys.length > 0) {
    projectContext = "CURRENT PROJECT FILES (These are the files currently in the workspace. Modify them if requested):\n";
    for (const key of fileKeys) {
      projectContext += `\n[FILE: ${key}]\n${currentProjectFiles[key].content}\n`;
    }
  }

  // 3. Prepare Chat History
  let historyContext = "";
  if (chatHistory.length > 0) {
    historyContext = "PREVIOUS CONVERSATION HISTORY:\n";
    for (const msg of chatHistory) {
      // Skip status messages if they don't have meaningful content yet, though usually they do.
      // We label them clearly.
      historyContext += `[${msg.role.toUpperCase()}]: ${msg.text}\n`;
    }
  }

  const dnaSection = dna ? `
STYLE DNA REFERENCE TEMPLATE (MANDATORY — match this visual style exactly):
Analyze this HTML template below. Extract its colors, fonts, spacing, shadows, border-radius, component patterns, dark/light mode, and CSS approach. ALL files you generate MUST follow this same visual language.
---START DNA---
${dna}
---END DNA---
` : '';

  const fullPrompt = `
    ${historyContext}
    ${dnaSection}
    ${projectContext}
    USER ATTACHMENTS:\n${attachmentContext}\n
    USER REQUEST:\n${prompt}
  `;

  // Fallback Strategy: Try Pro first, then Flash if quota exceeded
  const modelsToTry = ["gemini-3-pro-preview", "gemini-3-flash-preview"];
  
  for (const model of modelsToTry) {
    try {
      if (signal?.aborted) return;

      const responseStream = await ai.models.generateContentStream({
        model: model,
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        }
      });

      for await (const chunk of responseStream) {
        if (signal?.aborted) return;
        if (chunk.text) {
          yield chunk.text;
        }
      }
      
      // If we completed the stream successfully, return to exit the function
      return;

    } catch (error: any) {
      const errorMessage = error.message || JSON.stringify(error);
      const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      
      // If it's a quota error and we have another model to try...
      if (isQuotaError && model !== modelsToTry[modelsToTry.length - 1]) {
        console.warn(`Model ${model} hit quota limit. Falling back to next available model...`);
        // Optionally yield a small system note so the user sees something happening
        yield `\n\n> *System Note: High demand detected on Pro model. Switching to Flash model for optimization...*\n\n`;
        continue; // Try next model
      }
      
      // If it's not a quota error, or we ran out of models, throw the error
      console.error(`Architect Error (${model}):`, error);
      throw error;
    }
  }
};

export const analyzePRD = async (
  prompt: string,
  attachmentFiles: File[]
): Promise<PRDAnalysisResult> => {
  let attachmentContext = "";
  for (const file of attachmentFiles) {
    if (file.type.includes("text") || file.name.endsWith(".md") || file.name.endsWith(".html") || file.name.endsWith(".txt")) {
      const text = await file.text();
      attachmentContext += `\n[ATTACHMENT: ${file.name}]\n${text}\n`;
    }
  }

  const fullPrompt = `
    USER ATTACHMENTS:\n${attachmentContext}\n
    USER REQUEST:\n${prompt}
  `;

  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview"];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: fullPrompt,
        config: {
          systemInstruction: PRD_ANALYSIS_INSTRUCTION,
          temperature: 0.3,
        }
      });

      const text = response.text?.trim() || "{}";
      const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(cleaned);

      // Handle both old format (array) and new format (object with pages/colors)
      const pages: PageAnalysisItem[] = (Array.isArray(parsed) ? parsed : parsed.pages || [])
        .filter((item: any) => item.name && item.type)
        .map((item: any) => ({
          name: item.name,
          description: item.description || '',
          type: (['page', 'subpage', 'modal', 'component'].includes(item.type)
            ? item.type
            : 'page') as PageAnalysisItem['type']
        }));

      const colors = (!Array.isArray(parsed) && parsed.colors) ? parsed.colors : null;

      return { pages, colors };

    } catch (error: any) {
      const errorMessage = error.message || JSON.stringify(error);
      const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");

      if (isQuotaError && model !== modelsToTry[modelsToTry.length - 1]) {
        console.warn(`Model ${model} hit quota limit for analysis. Falling back...`);
        continue;
      }

      if (error instanceof SyntaxError) {
        console.warn("PRD analysis returned non-JSON response, skipping analysis step");
        return { pages: [], colors: null };
      }

      throw error;
    }
  }

  return { pages: [], colors: null };
};

export const mapIconNames = async (
  iconNames: string[],
  fromLibrary: string,
  toLibrary: string
): Promise<Record<string, string>> => {
  if (iconNames.length === 0) return {};

  const prompt = `You are an icon mapping expert. Map these icon names from the "${fromLibrary}" Iconify library to their closest equivalents in the "${toLibrary}" Iconify library.

Input icons (${fromLibrary} prefix): ${JSON.stringify(iconNames)}

Return ONLY a JSON object mapping each input name to its equivalent name in ${toLibrary}. Use the exact Iconify icon names (kebab-case, no prefix).
Example: {"home": "home", "chevron-down": "caret-down", "log-out": "logout"}

If an icon has the same name in both libraries, keep it. If there's no equivalent, use the closest match.
Return ONLY the JSON object, no markdown, no explanation.`;

  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview"];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: { temperature: 0.1 }
      });

      const text = response.text?.trim() || "{}";
      const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      return JSON.parse(cleaned);
    } catch (error: any) {
      const errorMessage = error.message || JSON.stringify(error);
      const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      if (isQuotaError && model !== modelsToTry[modelsToTry.length - 1]) continue;
      console.warn("Icon mapping failed, falling back to direct prefix swap:", error);
      return {};
    }
  }
  return {};
};

export const editElementWithAI = async (
  elementHtml: string,
  instruction: string,
  pageContext?: string
): Promise<string> => {
  const contextHint = pageContext
    ? `\nPAGE STYLE CONTEXT (for reference only — do NOT return the full page):\n${pageContext}\n`
    : '';

  const prompt = `You are an expert HTML/CSS editor. Edit ONLY the given HTML element based on the user instruction.
${contextHint}
ELEMENT TO EDIT:
${elementHtml}

USER INSTRUCTION: ${instruction}

RULES:
- Return ONLY the modified HTML element/fragment. NOT a full page.
- No markdown fences, no explanation, no comments.
- Keep Iconify icon format (<iconify-icon icon="prefix:name">) if present.
- Preserve existing classes, IDs, and attributes unless the instruction says to change them.
- If adding inline styles, use the style attribute.
- Match the existing design style visible in the element.`;

  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview"];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: { temperature: 0.3 }
      });

      let text = response.text?.trim() || '';
      text = text.replace(/^```html?\n?/, '').replace(/\n?```$/, '');
      if (!text || text.length < 3) {
        throw new Error('Response is empty or too short');
      }
      return text;
    } catch (error: any) {
      const errorMessage = error.message || JSON.stringify(error);
      const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      if (isQuotaError && model !== modelsToTry[modelsToTry.length - 1]) continue;
      throw error;
    }
  }
  throw new Error('All models failed');
};

export const editWithAI = async (
  currentHtml: string,
  instruction: string,
  selectedElementHtml?: string
): Promise<string> => {
  const selectedContext = selectedElementHtml
    ? `\nThe user has selected this specific element:\n<selected-element>\n${selectedElementHtml}\n</selected-element>\nFocus your edit on or around this element.\n`
    : '';

  const prompt = `You are an expert HTML/CSS editor. Given the current HTML page and a user instruction, return the COMPLETE modified HTML page.

CURRENT HTML:
${currentHtml}
${selectedContext}
USER INSTRUCTION: ${instruction}

RULES:
- Return ONLY the complete modified HTML. No markdown fences, no explanation, no comments about changes.
- Keep ALL existing structure, styles, scripts, and content that the user did not ask to change.
- If adding new sections, match the existing design style (colors, fonts, spacing, border-radius).
- If the user mentions a specific section (hero, footer, navbar, etc.), only modify that section.
- Preserve all existing <link>, <script>, and <style> tags exactly.
- Keep Iconify icon format (<iconify-icon icon="prefix:name">) if icons are present.
- Return a complete valid HTML document starting with <!DOCTYPE html>.`;

  const modelsToTry = ["gemini-3-flash-preview", "gemini-3-pro-preview"];

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: { temperature: 0.4 }
      });

      let text = response.text?.trim() || '';
      // Strip markdown fences if present
      text = text.replace(/^```html?\n?/, '').replace(/\n?```$/, '');
      if (!text.includes('<!DOCTYPE') && !text.includes('<html')) {
        throw new Error('Response does not contain valid HTML');
      }
      return text;
    } catch (error: any) {
      const errorMessage = error.message || JSON.stringify(error);
      const isQuotaError = errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED");
      if (isQuotaError && model !== modelsToTry[modelsToTry.length - 1]) continue;
      throw error;
    }
  }
  throw new Error('All models failed');
};
