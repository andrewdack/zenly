import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { z, ZodError } from "zod";
import { asyncHandler, HttpError } from "./http.js";
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

  console.error(err);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error"
    }
  });
};
