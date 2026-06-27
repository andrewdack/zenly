import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { z, ZodError } from "zod";
import { asyncHandler, HttpError } from "./http.js";
import { openApiDocument, swaggerHtml } from "./openapi.js";
import type { MessageSender } from "./services/messageSender.js";
import type { VisionProvider } from "./services/visionProvider.js";
import { CHECKIN_SYSTEM, checkInPrompt, PROFILER_SYSTEM, profilerPrompt, SNITCH_SYSTEM, snitchPrompt } from "./prompts.js";
import { DEFAULT_WATCHDOG, type WatchdogConfig } from "./agent/watchdog.js";
import * as sessions from "./store/sessions.js";
import * as profile from "./store/profile.js";
import { startLink } from "./util/deeplink.js";
import { normalizePhoneTarget } from "./util/phone.js";
import type { InterventionLevel, Session, SessionMode } from "./types.js";
import type OpenAI from "openai";

const INTERVENTION_LEVELS: InterventionLevel[] = ["nudge", "snitch"];

const e164PhoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Use one E.164 phone number, e.g. +15555555555");

const sendMessageSchema = z
  .object({
    to: e164PhoneNumberSchema,
    message: z.string().trim().min(1).max(1000),
    fromPhone: e164PhoneNumberSchema.optional()
  })
  .strict();

export interface CreateAppOptions {
  focusProvider: VisionProvider;
  messageSender: MessageSender;
  snitchAgentPhone?: string;
  openai: OpenAI;
  agentModel: string;
  snitchModel: string;
  deeplinkScheme: string;
  maxImageBytes?: number;
}

export function createApp(options: CreateAppOptions) {
  const { focusProvider, messageSender, openai, snitchModel, deeplinkScheme } = options;
  const snitchAgentPhone = options.snitchAgentPhone ?? "+14156055823";
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: options.maxImageBytes ?? 5_000_000,
      files: 1
    }
  });

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get(["/docs", "/docs/"], (_req, res) => {
    res.type("html").send(swaggerHtml);
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/isFocused",
    upload.single("image"),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new HttpError(400, "multipart image field is required", "image_required");
      }

      if (!req.file.mimetype.startsWith("image/")) {
        throw new HttpError(400, "uploaded file must be an image", "invalid_image_type");
      }

      const task = (req.body.task as string | undefined) || undefined;
      const result = await focusProvider.isFocused({
        image: req.file.buffer,
        mimeType: req.file.mimetype,
        mode: task ? "task" : "guardian",
        task,
      });

      res.json(result);
    })
  );

  app.post(
    "/sendMessage",
    asyncHandler(async (req, res) => {
      const input = sendMessageSchema.parse(req.body);
      const result = await messageSender.sendMessage(input);
      res.json({ sent: true, ...result });
    })
  );

  // ── LLM text helpers (shared by /judge and /snitch) ────────────────────────
  async function generateSnitchText(task: string, screenContent: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: snitchModel,
        max_tokens: 120,
        messages: [
          { role: "system", content: SNITCH_SYSTEM },
          { role: "user", content: snitchPrompt(task, screenContent) },
        ],
      });
      const message = completion.choices[0]?.message?.content?.trim();
      if (message) return message;
    } catch { /* fall through to default */ }
    return `your friend swore they'd be "${task}" but got caught ${screenContent}. just so you know 👀`;
  }

  async function generateCheckIn(session: Session, reason: string): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: snitchModel,
        max_tokens: 100,
        messages: [
          { role: "system", content: CHECKIN_SYSTEM },
          { role: "user", content: checkInPrompt(session, reason) },
        ],
      });
      const message = completion.choices[0]?.message?.content?.trim();
      if (message) return message;
    } catch { /* fall through to default */ }
    return "hey — noticed you drifted off. everything good? lock back in for me 👀";
  }

  function optionalNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function watchConfigFromBody(body: Record<string, unknown>): WatchdogConfig | undefined {
    const checkInCooldownMs = optionalNumber(body.checkInCooldownMs ?? body.graceMs);
    const windowMs = optionalNumber(body.windowMs);
    const snitchAfter = optionalNumber(body.snitchAfter);
    if (checkInCooldownMs === undefined && windowMs === undefined && snitchAfter === undefined) return undefined;

    return {
      checkInCooldownMs: checkInCooldownMs !== undefined && checkInCooldownMs >= 0
        ? checkInCooldownMs
        : DEFAULT_WATCHDOG.checkInCooldownMs,
      windowMs: windowMs !== undefined && windowMs > 0
        ? windowMs
        : DEFAULT_WATCHDOG.windowMs,
      snitchAfter: snitchAfter !== undefined && snitchAfter > 0
        ? Math.floor(snitchAfter)
        : DEFAULT_WATCHDOG.snitchAfter,
    };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  app.post(
    "/session/start",
    asyncHandler(async (req, res) => {
      const { userPhone, task, durationMinutes, mode, interventionLevel, contactPhone, name } = req.body ?? {};
      if (!userPhone) throw new HttpError(400, "userPhone is required", "missing_fields");
      const phone = normalizePhoneTarget(String(userPhone));

      const resolvedMode: SessionMode = mode === "guardian" ? "guardian" : "task";
      if (resolvedMode === "task" && !task)
        throw new HttpError(400, "task is required for a task session", "missing_fields");

      const level: InterventionLevel = INTERVENTION_LEVELS.includes(interventionLevel as InterventionLevel)
        ? (interventionLevel as InterventionLevel)
        : "nudge";
      const mins = durationMinutes ? parseInt(String(durationMinutes), 10) : null;
      const parsed = {
        mode: resolvedMode,
        task: resolvedMode === "guardian" ? null : String(task),
        durationMinutes: resolvedMode === "guardian" ? null : mins,
      };

      // Explicit identity from the app keeps the profile in sync with the agent.
      if (name) profile.upsertUser(phone, { name: String(name) });

      const normalizedContact = contactPhone ? normalizePhoneTarget(String(contactPhone)) : null;
      const session = sessions.startSession(phone, parsed, {
        interventionLevel: level,
        contactPhone: normalizedContact || null,
      });
      res.json({ session, deeplink: startLink(deeplinkScheme, parsed, phone) });
    })
  );

  app.get(
    "/session/:phone",
    asyncHandler(async (req, res) => {
      const phone = normalizePhoneTarget(String(req.params.phone));
      const session = sessions.getSession(phone);
      if (!session) { res.json({ active: false }); return; }
      res.json({
        active: true,
        session,
        stats: sessions.get(phone).stats,
        deeplink: startLink(deeplinkScheme, session, phone),
      });
    })
  );

  app.post(
    "/session/end",
    asyncHandler(async (req, res) => {
      const userPhone = (req.body?.userPhone as string | undefined)?.trim();
      if (!userPhone) throw new HttpError(400, "userPhone is required", "missing_fields");
      const phone = normalizePhoneTarget(userPhone);

      const session = sessions.getSession(phone);

      let memoriesAdded = 0;
      if (session) {
        const verdicts = profile.verdictsSince(phone, session.startedAt);
        const events = profile.eventsSince(phone, session.startedAt);

        if (verdicts.length > 0) {
          try {
            const existingMemories = profile.getMemories(phone, 20);
            const completion = await openai.chat.completions.create({
              model: snitchModel,
              max_tokens: 300,
              messages: [
                { role: "system", content: PROFILER_SYSTEM },
                { role: "user", content: profilerPrompt(session, verdicts, events, existingMemories) },
              ],
            });
            const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
            const parsed = JSON.parse(raw.replace(/^```json\n?|\n?```$/g, "")) as Array<{ kind: string; fact: string }>;
            for (const m of parsed) {
              if ((m.kind === "behavior" || m.kind === "preference") && typeof m.fact === "string") {
                profile.addMemory(phone, m.kind, m.fact);
                memoriesAdded++;
              }
            }
          } catch (err) {
            console.error("[session/end] profiler failed:", err);
          }
        }

        sessions.endSession(phone);
      }

      res.json({ ended: true, memoriesAdded });
    })
  );

  app.get(
    "/profile/:phone",
    asyncHandler(async (req, res) => {
      const phone = normalizePhoneTarget(String(req.params.phone));
      const p = profile.getProfile(phone);
      const stats = profile.behaviorStats(phone);
      const recentVerdicts = profile.recentVerdicts(phone, 10);
      res.json({ name: p.name, memories: p.memories, stats, recentVerdicts });
    })
  );

  // ── Judge (stateful watchdog: judge → check-in → escalate) ──────────────────
  app.post(
    "/judge",
    upload.single("image"),
    asyncHandler(async (req, res) => {
      if (!req.file) throw new HttpError(400, "multipart image field is required", "image_required");
      if (!req.file.mimetype.startsWith("image/"))
        throw new HttpError(400, "uploaded file must be an image", "invalid_image_type");

      const userPhone = (req.body.userPhone as string | undefined)?.trim();
      if (!userPhone) throw new HttpError(400, "userPhone form field is required", "missing_fields");
      const phone = normalizePhoneTarget(userPhone);

      const session = sessions.getSession(phone);
      if (!session) throw new HttpError(409, "no active session for this user", "no_active_session");

      const verdict = await focusProvider.isFocused({
        image: req.file.buffer,
        mimeType: req.file.mimetype,
        mode: session.mode,
        task: session.task,
      });

      profile.logVerdict(phone, verdict.status, verdict.destructiveCategory, verdict.reason, session.mode);

      const action = sessions.recordVerdict(
        phone, verdict.status, verdict.reason, Date.now(),
        watchConfigFromBody(req.body as Record<string, unknown>)
      );

      let escalation: { sent: boolean; to?: string; message?: string } = { sent: false };

      if (action.type === "checkin") {
        const message = await generateCheckIn(session, action.reason);
        sessions.appendTurn(phone, "assistant", message); // so their reply lands in context
        profile.logEvent(phone, "checkin", message);
        try {
          await messageSender.sendMessage({ to: phone, message });
          escalation = { sent: true, to: phone, message };
        } catch (err) {
          console.error("[judge] check-in send failed:", err);
          escalation = { sent: false, message };
        }
      } else if (action.type === "escalate") {
        if (action.level === "snitch" && session.contactPhone) {
          const contactPhone = normalizePhoneTarget(session.contactPhone);
          const message = await generateSnitchText(session.task ?? "staying off the bad apps", verdict.reason);
          try {
            await messageSender.sendMessage({ to: contactPhone, message, fromPhone: snitchAgentPhone });
            sessions.recordSnitch(phone);
            profile.logEvent(phone, "snitch", message);
            escalation = { sent: true, to: contactPhone, message };
          } catch (err) {
            console.error("[judge] snitch send failed:", err);
            escalation = { sent: false, message };
          }
        } else if (action.level === "nudge") {
          sessions.recordNudge(phone);
          profile.logEvent(phone, "nudge", verdict.reason);
        }
        // nudge is applied on-device by the app from `action`; snitch is sent server-side.
      }

      res.json({ verdict, action, escalation, stats: sessions.get(phone).stats });
    })
  );

  // ── Snitch (manual trigger) ─────────────────────────────────────────────────
  app.post(
    "/snitch",
    asyncHandler(async (req, res) => {
      const { task, contactPhone, screenContent, userPhone } = req.body ?? {};
      if (!task || !contactPhone || !screenContent)
        throw new HttpError(400, "task, contactPhone, and screenContent are required", "missing_fields");

      const normalizedContact = normalizePhoneTarget(String(contactPhone));
      const message = await generateSnitchText(task as string, screenContent as string);
      const result = await messageSender.sendMessage({ to: normalizedContact, message, fromPhone: snitchAgentPhone });
      if (userPhone) sessions.recordSnitch(normalizePhoneTarget(String(userPhone)));
      res.json({ message, ...result });
    })
  );

  app.use(errorHandler);

  return app;
}

const PHOTON_TARGET_NOT_ALLOWED = "Target not allowed for this project";

function errorText(err: unknown, depth = 0): string {
  if (depth > 3 || err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    return `${err.message} ${errorText(err.cause, depth + 1)}`;
  }
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    return [record.message, record.details, errorText(record.cause, depth + 1)]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
  }
  return "";
}

function isPhotonTargetNotAllowedError(err: unknown): boolean {
  return errorText(err).includes(PHOTON_TARGET_NOT_ALLOWED);
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    res.status(status).json({
      error: {
        code: err.code.toLowerCase(),
        message: err.message
      }
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Invalid request body",
        issues: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message
      }
    });
    return;
  }

  if (isPhotonTargetNotAllowedError(err)) {
    res.status(403).json({
      error: {
        code: "photon_target_not_allowed",
        message: "Photon rejected this recipient. Add the phone number or iMessage email under Photon Dashboard > Users, then retry."
      }
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error"
    }
  });
};
