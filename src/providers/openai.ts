import OpenAI from "openai";

export async function streamText(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const client = new OpenAI({ apiKey });
  let fullText = "";

  const stream = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }

  return fullText;
}
