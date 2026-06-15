import { GoogleGenAI } from "@google/genai";

export async function streamText(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  onChunk: (text: string) => void,
): Promise<string> {
  const client = new GoogleGenAI({ apiKey });
  let fullText = "";

  const stream = await client.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens: 4096,
    },
  });

  for await (const chunk of stream) {
    const text = chunk.text ?? "";
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }

  return fullText;
}
