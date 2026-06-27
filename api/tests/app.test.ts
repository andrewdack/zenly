import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { MessageSender } from "../src/services/messageSender.js";
import type { VisionProvider } from "../src/services/visionProvider.js";

function makeApp(options: { messageSender?: MessageSender } = {}) {
  const focusProvider: VisionProvider = {
    isFocused: vi.fn(async () => ({
      status: "ok" as const,
      isFocused: true,
      destructiveCategory: null,
      confidence: 0.92,
      reason: "Person appears engaged with the screen.",
      provider: "openrouter",
      model: "test-model"
    }))
  };

  const messageSender: MessageSender = options.messageSender ?? {
    sendMessage: vi.fn(async ({ to }) => ({
      provider: "photon" as const,
      platform: "imessage" as const,
      to,
      messageId: "msg_123",
      spaceId: "space_123"
    }))
  };

  const app = createApp({
    focusProvider,
    messageSender,
    maxImageBytes: 1024 * 1024
  });

  return { app, focusProvider, messageSender };
}

describe("Zenly API", () => {
  it("returns health status", async () => {
    const { app } = makeApp();

    await request(app).get("/health").expect(200, { ok: true });
  });

  it("serves Swagger docs and the OpenAPI document", async () => {
    const { app } = makeApp();

    const docsResponse = await request(app).get("/docs").expect(200);
    expect(docsResponse.headers["content-type"]).toContain("text/html");
    expect(docsResponse.text).toContain("SwaggerUIBundle");
    expect(docsResponse.text).toContain("/openapi.json");

    const specResponse = await request(app).get("/openapi.json").expect(200);
    expect(specResponse.body.openapi).toBe("3.0.3");
    expect(specResponse.body.paths).toHaveProperty("/isFocused");
    expect(specResponse.body.paths).toHaveProperty("/sendMessage");
  });

  it("classifies focus from an uploaded image", async () => {
    const { app, focusProvider } = makeApp();

    const response = await request(app)
      .post("/isFocused")
      .attach("image", Buffer.from("fake-png"), {
        filename: "frame.png",
        contentType: "image/png"
      })
      .expect(200);

    expect(response.body).toEqual({
      status: "ok",
      isFocused: true,
      destructiveCategory: null,
      confidence: 0.92,
      reason: "Person appears engaged with the screen.",
      provider: "openrouter",
      model: "test-model"
    });
    expect(focusProvider.isFocused).toHaveBeenCalledWith({
      image: expect.any(Buffer),
      mimeType: "image/png",
      mode: "guardian",
      task: undefined
    });
  });

  it("requires an image upload for focus checks", async () => {
    const { app } = makeApp();

    const response = await request(app).post("/isFocused").expect(400);

    expect(response.body.error.code).toBe("image_required");
  });

  it("rejects non-image uploads for focus checks", async () => {
    const { app } = makeApp();

    const response = await request(app)
      .post("/isFocused")
      .attach("image", Buffer.from("not an image"), {
        filename: "notes.txt",
        contentType: "text/plain"
      })
      .expect(400);

    expect(response.body.error.code).toBe("invalid_image_type");
  });

  it("sends one phone-number based accountability message", async () => {
    const { app, messageSender } = makeApp();

    const response = await request(app)
      .post("/sendMessage")
      .send({
        to: "+15555555555",
        message: "Time to lock in."
      })
      .expect(200);

    expect(response.body).toEqual({
      sent: true,
      provider: "photon",
      platform: "imessage",
      to: "+15555555555",
      messageId: "msg_123",
      spaceId: "space_123"
    });
    expect(messageSender.sendMessage).toHaveBeenCalledWith({
      to: "+15555555555",
      message: "Time to lock in."
    });
  });

  it("returns a clear error when Photon rejects a non-allowlisted recipient", async () => {
    const messageSender: MessageSender = {
      sendMessage: vi.fn(async () => {
        throw new Error("[spectrum-imessage] Target not allowed for this project");
      })
    };
    const { app } = makeApp({ messageSender });

    const response = await request(app)
      .post("/sendMessage")
      .send({
        to: "+15555555555",
        message: "Time to lock in."
      })
      .expect(403);

    expect(response.body.error.code).toBe("photon_target_not_allowed");
    expect(response.body.error.message).toContain("Photon Dashboard > Users");
  });

  it("rejects invalid phone numbers", async () => {
    const { app, messageSender } = makeApp();

    const response = await request(app)
      .post("/sendMessage")
      .send({
        to: "555-555-5555",
        message: "Time to lock in."
      })
      .expect(400);

    expect(response.body.error.code).toBe("validation_error");
    expect(messageSender.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects group-style recipient arrays", async () => {
    const { app, messageSender } = makeApp();

    const response = await request(app)
      .post("/sendMessage")
      .send({
        to: ["+15555555555", "+16666666666"],
        message: "Time to lock in."
      })
      .expect(400);

    expect(response.body.error.code).toBe("validation_error");
    expect(messageSender.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects empty messages", async () => {
    const { app, messageSender } = makeApp();

    await request(app)
      .post("/sendMessage")
      .send({
        to: "+15555555555",
        message: "   "
      })
      .expect(400);

    expect(messageSender.sendMessage).not.toHaveBeenCalled();
  });
});
