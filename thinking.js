import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

// brainstorming how should we make file-edit.js more robust and concise? follow coding convention in CLAUDE.js and api.js

// brainstorming how should we make persistent_shell.js much more concise? follow coding convention in CLAUDE.js and api.js

const name = "ThinkingTool";
const DESCRIPTION = `
A thinking tool that helps to brainstorm, write creatively, code, program, plan, debugs. 
Really good to solve hard problem that cannot be solved normally.

Usage:
Provide a clear problem statement

Parameters:
- prompt (required): The problem or task to think about
- temperature (optional): Controls randomness (0.6-0.65)
- max_tokens (optional): Maximum output length
`;

const schema = {
  name: name, description: DESCRIPTION,
  parameters: {
    type: "object", required: ["prompt"],
    properties: {
      prompt: { type: "string", description: "The problem or task to think about" },
      model: { type: "string", description: "Together AI model to use", default: "deepseek-ai/DeepSeek-R1" },
      temperature: { type: "number", description: "Controls randomness (0.6-0.65)", default: 0.6 },
      max_tokens: { type: "number", description: "Maximum output length", default: 8000 }
    }
  }
};

async function queryTogetherAI({ model, messages, temperature = 0.6, max_tokens = 8000 }) {
  const url = "https://api.together.xyz/v1/chat/completions";
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`
  };

  const body = JSON.stringify({model, messages, temperature, max_tokens, stop: ["<｜end▁of▁sentence｜>"]});

  try {
    const response = await fetch(url, { method: "POST", headers, body });
    return await response.json();
  } catch (error) { console.error("Error querying Together AI:", JSON.stringify(error)); }
}

/**
 * Read file content from a given path
 * @param {string} filePath - Path to the file to read
 * @returns {Promise<string>} - File content as string
 */
async function readFileContent(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return `[Error reading file: ${error.message}]`;
  }
}

/**
 * Extract file paths from the prompt string
 * @param {string} prompt - The prompt string that may contain file paths
 * @returns {Array<string>} - Array of potential file paths
 */
function extractFilePaths(prompt) {
  // Look for common file path patterns in the prompt
  // This regex looks for strings that look like file paths
  const filePathRegex = /(?:^|\s)(\/[\w\.\-\/]+\.[\w\.]+)(?:\s|$)/g;
  const matches = [...prompt.matchAll(filePathRegex)];
  return matches.map(match => match[1]);
}

/**
 * Get all files in directory recursively
 * @returns {Promise<string[]>} Array of file paths
 */
async function getAllFiles() {
  const entries = await fs.readdir('.', { withFileTypes: true });
  return entries
    .filter(entry => !entry.isDirectory() && (entry.name.endsWith('CLAUDE.md') || entry.name.endsWith('.js')))
    .map(entry => entry.name);
}

const handler = async (toolCall) => {
    const { prompt, model = "deepseek-ai/DeepSeek-R1", temperature = 0.6, max_tokens = 8000 } = toolCall.input;

    // Get all files and read their contents
    const files = await getAllFiles();
    const fileContents = await Promise.all(
      files.map(async (file) => {
        const content = await readFileContent(file);
        return `<file name='${file}'>${content}</file>`;
      })
    );
    
    // Format the thinking prompt with context and think tag
    const contextStr = fileContents.join('\n');

    const messages = [
      { 
        role: "user", 
        // content: prompt 
        content: `<context>${contextStr}</context>\n\n${prompt}` 
      },
      { 
        role: "assistant", 
        content: "<think>\n" 
      }
    ];

    // Call the Together AI API
    const response = await queryTogetherAI({ model, messages, temperature, max_tokens });

    // Extract the thinking response and split into think/answer parts
    const fullResponse = response.choices?.[0]?.message?.content || "";
    const [thinking, answer] = fullResponse.split('</think>').map(s => s.trim());
    console.log(`\x1b[33m${model}:\x1b[0m\n\x1b[36mThinking:\x1b[0m ${thinking}\n\x1b` + 
      `[32mAnswer:\x1b[0m ${answer}`);

    return {
      thinking: answer || thinking, // Return answer if available, otherwise full thinking
      summary: "Thinking process completed"
    };
};

export { name, schema, handler };
