import OpenAI from "openai";
import { z } from "zod";
import { HttpError } from "../http.js";
import type { FocusImageInput, FocusResult, VisionProvider } from "./visionProvider.js";

const focusResponseSchema = z.object({
  isFocused: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500)
});

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(unfenced);
}

export interface OpenAiFocusProviderOptions {
  apiKey?: string;
  model: string;
  baseURL?: string;
  providerName?: string;
  client?: OpenAI;
}

export class OpenAiFocusProvider implements VisionProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly providerName: string;

  constructor(options: OpenAiFocusProviderOptions) {
    if (!options.apiKey && !options.client) {
      console.warn("[focus] OPENROUTER_API_KEY not set — /isFocused will return errors.");
    }
    this.model = options.model;
    this.providerName = options.providerName ?? "openrouter";
    this.client =
      options.client ??
      new OpenAI({ apiKey: options.apiKey ?? "not-configured", baseURL: options.baseURL });
  }

  async isFocused(input: FocusImageInput): Promise<FocusResult> {
    const imageUrl = `data:${input.mimeType};base64,${input.image.toString("base64")}`;

    const userPrompt = input.task
      ? `The user's goal is: "${input.task}". Analyze this screenshot and judge whether they are working toward that goal. Respond as JSON: {"isFocused": boolean, "confidence": number between 0 and 1, "reason": short string}.`
      : `Analyze this frame from a focus/accountability app. Respond as JSON: {"isFocused": boolean, "confidence": number between 0 and 1, "reason": short string}.`;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You classify whether a person appears focused on their stated task from a screenshot. Return only JSON with isFocused, confidence, and reason. Be conservative when uncertain."
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl, detail: "low" } }
          ]
        }
      ]
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, "Focus provider returned an empty response", "focus_provider_empty_response");
    }

    const parsed = focusResponseSchema.safeParse(parseJsonObject(content));
    if (!parsed.success) {
      throw new HttpError(502, "Focus provider returned an invalid response", "focus_provider_invalid_response");
    }

    return { ...parsed.data, provider: this.providerName, model: this.model };
  }
}
