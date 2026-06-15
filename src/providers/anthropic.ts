import Anthropic from "@anthropic-ai/sdk";

function supportsThinking(model: string): boolean {
  return model.includes("opus") || model.includes("sonnet");
}

export async function streamText(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const client = new Anthropic({ apiKey });
  let fullText = "";

  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
    ...(supportsThinking(model) ? { thinking: { type: "adaptive" } } : {}),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      onChunk(event.delta.text);
    }
  }

  return fullText;
}
