
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";
import { GeneratedFile, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  chatHistory: ChatMessage[] = []
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

  const fullPrompt = `
    ${historyContext}
    
    STYLE DNA:\n${dna}\n
    ${projectContext}
    USER ATTACHMENTS:\n${attachmentContext}\n
    USER REQUEST:\n${prompt}
  `;

  // Fallback Strategy: Try Pro first, then Flash if quota exceeded
  const modelsToTry = ["gemini-3-pro-preview", "gemini-3-flash-preview"];
  
  for (const model of modelsToTry) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model: model,
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7, 
        }
      });

      for await (const chunk of responseStream) {
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
