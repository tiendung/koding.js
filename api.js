import { SMALL_MODEL, LARGE_MODEL } from './constants.js';
import promptSync from 'prompt-sync';
const prompt = promptSync();

export async function api({ messages, tools, systemPrompt, model, maxTokens = 1024 }) {
  const url = "https://api.anthropic.com/v1/messages";
  const headers = {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
  };

  // Add beta header for large model
  if (model == LARGE_MODEL) headers["anthropic-beta"] = "token-efficient-tools-2025-02-19";

  // Format system prompts and apply token efficiency
  const system = systemPrompt.map(prompt => ({ type: "text", text: prompt }));
  system.at(-1).cache_control = {type: "ephemeral"};
  tools.at(-1).cache_control = {type: "ephemeral"};

  const body = JSON.stringify({ system, model, messages, tools, max_tokens: maxTokens });
  const response = await fetch(url, {method: "POST", headers, body});

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`HTTP error! status: ${response.status}, error: ${JSON.stringify(error)}`);
  }
  return await response.json();
}


// Compact logging function for different content types
const log = (block) => {
  const logTypes = {
    string: (b) => console.log(b),
    object: (b) => {
      if (Array.isArray(b)) for(const x of block) log(x); 
      else if (b.role) { console.log(`\x1b[36m> ${b.role}\x1b[0m`); log(b.content); } 
      else if (b.text) console.log(`${b.text.trim()}\n`);
      else if (b.type === "tool_use") console.log(`\x1b[32m> ${b.name}\x1b[0m: ${JSON.stringify(b.input)}`);
      else if (b.type === "tool_result") console.log(`\x1b[34m> ${b.tool_use_id}\x1b[0m: ${b.content}`);
    }
  };
  (logTypes[typeof block] || (b => console.log(b)))(block);
};


export async function query({ userPrompt, tools, systemPrompt, shouldExit = false,
  model = SMALL_MODEL, maxTokens = 1024, acceptUserInput = false }) {
  let messages = [];
  
  // Compact user input handler
  const userInput = () => {
    const input = prompt('\x1b[32muser: \x1b[0m').trim();
    messages.push({ role: "user", content: input });
    if (input === "q") process.exit(); // [q]uit program
  }

  // Initialize messages based on user input mode
  if (acceptUserInput && userPrompt === null) userInput();
  else messages.push({ role: "user", content: [{ type: "text", text: userPrompt }] });

  // Compact tool schema transformation
  const toolSchema = tools.map(tool => ({
    name: tool.name, description: tool.schema.description,
    input_schema: tool.schema.input_schema || tool.schema.parameters,
  }));
  
  // Main tool use loop
  while (true) { 
    const apiResponse = await api({ messages, tools: toolSchema, systemPrompt, model, maxTokens });
    const assistantMessage = { role: apiResponse.role, content: apiResponse.content };
    messages.push(assistantMessage);
    log(assistantMessage);

    // Compact token usage logging
    const u = apiResponse.usage;
    const usageInfo = `${apiResponse.model} (i: ${u.input_tokens}, o: ${u.output_tokens}, c: ${u.cache_read_input_tokens})`;
    console.log(`\x1b[35m${usageInfo}\x1b[0m`);

    // Process tool calls or handle completion
    const toolCalls = apiResponse.content?.filter(block => block.type === 'tool_use') || [];

    if (toolCalls.length === 0) { 
      // Handle conversation completion or continue
      if (!acceptUserInput) return shouldExit ? process.exit() : apiResponse;
      else userInput(); // Continue dialog with LLM
    } else {
      // Execute all tool calls in parallel
      const toolResults = await Promise.all(toolCalls.map(async (toolCall) => {
        const tool = tools.find(t => t.name === toolCall.name);
        const result = tool ? await tool.handler(toolCall) : '<tool-not-found>';
        return { type: "tool_result", tool_use_id: toolCall.id, content: JSON.stringify(result) };
      }));

      // Send single message with all tool results
      messages.push({ role: "user", content: toolResults });
    }
  } // End main loop
}