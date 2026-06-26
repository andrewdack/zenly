import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { z, ZodError } from "zod";
import { asyncHandler, HttpError } from "./http.js";
import type { MessageSender } from "./services/messageSender.js";
import type { VisionProvider } from "./services/visionProvider.js";
import { SNITCH_SYSTEM, snitchPrompt } from "./prompts.js";
import * as sessions from "./store/sessions.js";
import { startLink } from "./util/deeplink.js";
import type OpenAI from "openai";

const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Use E.164 format, e.g. +15555555555");

const sendMessageSchema = z
  .object({ to: e164Schema, message: z.string().trim().min(1).max(1000) })
  .strict();

export interface CreateAppOptions {
  focusProvider: VisionProvider;
  messageSender: MessageSender;
  openai: OpenAI;
  agentModel: string;
  snitchModel: string;
  deeplinkScheme: string;
  maxImageBytes?: number;
}

export function createApp(options: CreateAppOptions) {
  const { focusProvider, messageSender, openai, agentModel, snitchModel, deeplinkScheme } = options;
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: options.maxImageBytes ?? 5_000_000, files: 1 },
  });

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // ── Health ──────────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // ── Vision judge ────────────────────────────────────────────────────────────
  // POST /isFocused  multipart: image (required), task (optional form field)
  app.post(
    "/isFocused",
    upload.single("image"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, "multipart image field is required", "image_required");
      if (!req.file.mimetype.startsWith("image/"))
        throw new HttpError(400, "uploaded file must be an image", "invalid_image_type");

      const result = await focusProvider.isFocused({
        image: req.file.buffer,
        mimeType: req.file.mimetype,
        task: req.body.task as string | undefined,
      });
      res.json(result);
    })
  );

  // ── Messaging ───────────────────────────────────────────────────────────────
  app.post(
    "/sendMessage",
    asyncHandler(async (req, res) => {
      const input = sendMessageSchema.parse(req.body);
      const result = await messageSender.sendMessage(input);
      res.json({ sent: true, ...result });
    })
  );

  // ── Sessions ────────────────────────────────────────────────────────────────
  app.post(
    "/session/start",
    asyncHandler(async (req, res) => {
      const { userPhone, task, durationMinutes } = req.body ?? {};
      if (!userPhone || !task)
        throw new HttpError(400, "userPhone and task are required", "missing_fields");
      const mins = durationMinutes ? parseInt(String(durationMinutes), 10) : null;
      const session = sessions.startSession(String(userPhone), { task: String(task), durationMinutes: mins });
      res.json({ session, deeplink: startLink(deeplinkScheme, { task: String(task), durationMinutes: mins }) });
    })
  );

  app.get(
    "/session/:phone",
    asyncHandler(async (req, res) => {
      const phone = String(req.params.phone);
      const session = sessions.getSession(phone);
      if (!session) { res.json({ active: false }); return; }
      res.json({
        active: true,
        session,
        stats: sessions.get(phone).stats,
        deeplink: startLink(deeplinkScheme, { task: session.task, durationMinutes: session.durationMinutes }),
      });
    })
  );

  // ── Snitch ──────────────────────────────────────────────────────────────────
  // POST /snitch  { task, contactPhone, screenContent, userPhone? }
  app.post(
    "/snitch",
    asyncHandler(async (req, res) => {
      const { task, contactPhone, screenContent, userPhone } = req.body ?? {};
      if (!task || !contactPhone || !screenContent)
        throw new HttpError(400, "task, contactPhone, and screenContent are required", "missing_fields");

      let message: string;
      try {
        const res2 = await openai.chat.completions.create({
          model: snitchModel,
          max_tokens: 120,
          messages: [
            { role: "system", content: SNITCH_SYSTEM },
            { role: "user", content: snitchPrompt(task as string, screenContent as string) },
          ],
        });
        message = res2.choices[0]?.message?.content?.trim() ?? "";
      } catch {
        message = "";
      }
      if (!message) {
        message = `Your friend swore they'd be "${task}" but got caught ${screenContent}. Just so you know. 👀`;
      }

      const result = await messageSender.sendMessage({ to: contactPhone as string, message });
      if (userPhone) sessions.recordSnitch(userPhone as string);
      res.json({ message, ...result });
    })
  );

  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({ error: { code: err.code.toLowerCase(), message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request body",
        issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Internal server error" } });
};
