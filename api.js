import { SMALL_MODEL } from './constants.js';

export async function api({ messages, tools, systemPrompt, model = SMALL_MODEL, maxTokens = 2048 }) {
  const url = "https://api.anthropic.com/v1/messages";
  const headers = {
    "content-type": "application/json",
    "x-api-key": process.env.ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01"
  };
  const body = JSON.stringify({
    system: systemPrompt.map(prompt => ({ type: "text", text: prompt })),
    model, messages, tools, max_tokens: maxTokens,
  });

  console.log(`=== SENDING PROMPT TO ${model} ===`);
  console.log("Messages:", JSON.stringify(messages, null, 2));
  console.log("=== END OF PROMPT ===");

  const response = await fetch(url, {method: "POST", headers, body});

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`HTTP error! status: ${response.status}, error: ${JSON.stringify(error)}`);
  }
  return await response.json();
}


function log(block) {
    if(typeof block === "string") {
        console.log(block);

    } else if(Array.isArray(block)) {
        for(const item of block) { log(item); }

    } else if(typeof block === "object") {
        if(block.role) {
            console.log(`\x1b[36m> ${block.role}\x1b[0m`);
            log(block.content);
            console.log("\n");
            return

        } else if (block.text) {
            console.log(`${block.text}\n\n`);

        } else {
            if(block.type === "tool_use") {
                console.log(`\x1b[32m> ${block.name}\x1b[0m: ${JSON.stringify(block.input)}`);

            } else if(block.type === "tool_result") {
                console.log(`\x1b[34m> ${block.tool_use_id}\x1b[0m: ${block.content}`);
            }
        }
    }
}


export async function query({ userPrompt, tools, systemPrompt, model = SMALL_MODEL, maxTokens = 1024 }) {
  let messages = [{ role: "user", content: [{ type: "text", text: userPrompt }] }];

  const toolSchema = tools.map(tool => ({
    name: tool.name, description: tool.schema.description,
    input_schema: tool.schema.input_schema || tool.schema.parameters,
  }));
  
  while (true) { // the main loop
    // try {
    const apiResponse = await api({ messages, tools: toolSchema, systemPrompt, model, maxTokens });
    const assistantMessage = { role: apiResponse.role, content: apiResponse.content };

    messages.push(assistantMessage);
    log(assistantMessage);

    // Extract tool calls and wait for all results before continuing
    const toolCalls = apiResponse.content?.filter(block => block.type === 'tool_use') || [];

    if (toolCalls.length === 0) { 
      return; // thoát khỏi main loop khi không còn tool calls 
      // TODO: handle user input để tiếp tục đối thoại ở đây ??
    }

    await Promise.all(toolCalls.map(async (toolCall) => {
      const tool = tools.find(t => t.name === toolCall.name);
      const c = JSON.stringify( tool ? await tool.handler(toolCall) : '<tool-not-found>' );
      const r = { role: "user", content: [{ type: "tool_result", tool_use_id: toolCall.id, content: c }] };
      log(r); messages.push(r);
    }));
    // } catch (error) { console.error("Error:", error.message); return; }
  }
}