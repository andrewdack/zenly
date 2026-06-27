import OpenAI from "openai";
import { z } from "zod";
import { HttpError } from "../http.js";
import { focusJudgeSystem } from "../prompts.js";
import type { FocusImageInput, FocusResult, VisionProvider } from "./visionProvider.js";

const focusResponseSchema = z.object({
  status: z.enum(["on_task", "off_task", "destructive", "ok"]),
  destructiveCategory: z.string().nullish(),
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
      throw new Error("OPENROUTER_API_KEY is required for focus checks");
    }

    this.model = options.model;
    this.providerName = options.providerName ?? "openrouter";
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL
      });
  }

  async isFocused(input: FocusImageInput): Promise<FocusResult> {
    const imageUrl = `data:${input.mimeType};base64,${input.image.toString("base64")}`;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      max_tokens: 180,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: focusJudgeSystem(input.mode, input.task ?? null)
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "analyze this frame and respond with only the json described above."
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "low"
              }
            }
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

    const { status, confidence, reason } = parsed.data;
    return {
      status,
      isFocused: status === "on_task" || status === "ok",
      destructiveCategory: parsed.data.destructiveCategory ?? null,
      confidence,
      reason,
      provider: this.providerName,
      model: this.model
    };
  }
}
