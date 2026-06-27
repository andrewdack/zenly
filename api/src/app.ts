import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { z, ZodError } from "zod";
import { asyncHandler, HttpError } from "./http.js";
import { openApiDocument, swaggerHtml } from "./openapi.js";
import type { MessageSender } from "./services/messageSender.js";
import type { VisionProvider } from "./services/visionProvider.js";

const e164PhoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, "Use one E.164 phone number, e.g. +15555555555");

const sendMessageSchema = z
  .object({
    to: e164PhoneNumberSchema,
    message: z.string().trim().min(1).max(1000)
  })
  .strict();

export interface CreateAppOptions {
  focusProvider: VisionProvider;
  messageSender: MessageSender;
  maxImageBytes?: number;
}

export function createApp(options: CreateAppOptions) {
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

      const result = await options.focusProvider.isFocused({
        image: req.file.buffer,
        mimeType: req.file.mimetype
      });

      res.json(result);
    })
  );

  app.post(
    "/sendMessage",
    asyncHandler(async (req, res) => {
      const input = sendMessageSchema.parse(req.body);
      const result = await options.messageSender.sendMessage(input);

      res.json({
        sent: true,
        ...result
      });
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
