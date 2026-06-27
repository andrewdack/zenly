process.env.ZENLY_DB_PATH = ":memory:";

import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { MessageSender } from "../src/services/messageSender.js";
import type { VisionProvider } from "../src/services/visionProvider.js";
import { closeDb } from "../src/store/db.js";

afterAll(() => closeDb());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeApp(options: { messageSender?: MessageSender; openai?: any } = {}) {
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
    openai: options.openai,
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

describe("POST /session/end", () => {
  const PHONE = "+15550001001";

  it("returns ended:true with memoriesAdded:0 when there is no active session", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/session/end")
      .send({ userPhone: PHONE })
      .expect(200);
    expect(res.body).toEqual({ ended: true, memoriesAdded: 0 });
  });

  it("ends a session with no verdicts without calling the LLM", async () => {
    const openai = { chat: { completions: { create: vi.fn() } } };
    const { app } = makeApp({ openai });

    await request(app)
      .post("/session/start")
      .send({ userPhone: PHONE, task: "write tests" })
      .expect(200);

    const res = await request(app)
      .post("/session/end")
      .send({ userPhone: PHONE })
      .expect(200);

    expect(res.body).toEqual({ ended: true, memoriesAdded: 0 });
    expect(openai.chat.completions.create).not.toHaveBeenCalled();

    // session should be gone
    const session = await request(app).get(`/session/${encodeURIComponent(PHONE)}`).expect(200);
    expect(session.body.active).toBe(false);
  });

  it("calls the LLM and stores memories when verdicts exist", async () => {
    const openai = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{
              message: {
                content: '[{"kind":"behavior","fact":"drifts to games after 15 min"},{"kind":"preference","fact":"prefers timed sessions"}]'
              }
            }]
          }))
        }
      }
    };
    // use on_task so watchdog never fires a check-in (which would also call the LLM)
    const focusProvider: VisionProvider = {
      isFocused: vi.fn(async () => ({
        status: "on_task" as const,
        isFocused: true,
        destructiveCategory: null,
        confidence: 0.95,
        reason: "Writing code",
        provider: "openrouter",
        model: "test-model"
      }))
    };
    const app = createApp({ focusProvider, messageSender: { sendMessage: vi.fn(async ({ to }) => ({ provider: "photon" as const, platform: "imessage" as const, to, messageId: "x", spaceId: "y" })) }, openai, maxImageBytes: 1024 * 1024 });
    const PHONE2 = "+15550001002";

    await request(app).post("/session/start").send({ userPhone: PHONE2, task: "study" }).expect(200);
    await request(app).post("/judge").attach("image", Buffer.from("fake"), { filename: "f.jpg", contentType: "image/jpeg" }).field("userPhone", PHONE2).expect(200);

    const res = await request(app).post("/session/end").send({ userPhone: PHONE2 }).expect(200);
    expect(res.body.ended).toBe(true);
    expect(res.body.memoriesAdded).toBe(2);
    expect(openai.chat.completions.create).toHaveBeenCalledOnce();
  });
});

describe("GET /profile/:phone", () => {
  it("returns profile shape for a known user", async () => {
    const { app } = makeApp();
    const PHONE = "+15550001003";
    // seed via session/start (creates the user row)
    await request(app).post("/session/start").send({ userPhone: PHONE, task: "study", name: "Alex" }).expect(200);

    const res = await request(app)
      .get(`/profile/${encodeURIComponent(PHONE)}`)
      .expect(200);

    expect(res.body).toMatchObject({
      name: "Alex",
      memories: expect.any(Array),
      stats: expect.objectContaining({ total: expect.any(Number), checkIns: expect.any(Number), snitches: expect.any(Number) }),
      recentVerdicts: expect.any(Array)
    });
  });

  it("returns empty profile for an unknown user", async () => {
    const { app } = makeApp();
    const res = await request(app).get(`/profile/${encodeURIComponent("+15550009999")}`).expect(200);
    expect(res.body.memories).toEqual([]);
    expect(res.body.stats.total).toBe(0);
  });
});
