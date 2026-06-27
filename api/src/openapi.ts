export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Zenly API",
    version: "0.1.0",
    description: "Focus checks and one-time accountability messages."
  },
  servers: [
    {
      url: "http://localhost:3001",
      description: "Local development"
    }
  ],
  tags: [
    {
      name: "System",
      description: "Service status"
    },
    {
      name: "Focus",
      description: "Image-based focus classification"
    },
    {
      name: "Messaging",
      description: "Photon Spectrum accountability messages"
    }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": {
            description: "API is running",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ok"],
                  properties: {
                    ok: {
                      type: "boolean",
                      example: true
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/isFocused": {
      post: {
        tags: ["Focus"],
        summary: "Classify whether an uploaded image shows focus",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: {
                    type: "string",
                    format: "binary",
                    description: "Image frame to classify"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Focus classification result",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/FocusResponse"
                }
              }
            }
          },
          "400": {
            description: "Missing or invalid image upload",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "413": {
            description: "Image file is too large",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/sendMessage": {
      post: {
        tags: ["Messaging"],
        summary: "Send a one-time accountability message",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SendMessageRequest"
              },
              example: {
                to: "+15555555555",
                message: "Time to lock in.",
                fromPhone: "+14156035536"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Message accepted by Photon",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/SendMessageResponse"
                }
              }
            }
          },
          "400": {
            description: "Invalid request body",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ValidationErrorResponse"
                }
              }
            }
          },
          "403": {
            description: "Recipient is not allowlisted for this Photon project",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                },
                example: {
                  error: {
                    code: "photon_target_not_allowed",
                    message: "Photon rejected this recipient. Add the phone number or iMessage email under Photon Dashboard > Users, then retry."
                  }
                }
              }
            }
          },
          "500": {
            description: "Messaging provider error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      FocusResponse: {
        type: "object",
        required: ["status", "isFocused", "confidence", "reason", "provider", "model"],
        properties: {
          status: {
            type: "string",
            enum: ["on_task", "off_task", "destructive", "ok"],
            example: "destructive"
          },
          destructiveCategory: {
            type: "string",
            nullable: true,
            enum: ["social", "games", "gambling", "other", null],
            example: "social"
          },
          isFocused: {
            type: "boolean",
            example: false
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            example: 0.95
          },
          reason: {
            type: "string",
            example: "No person visible."
          },
          provider: {
            type: "string",
            example: "openrouter"
          },
          model: {
            type: "string",
            example: "google/gemma-3-12b-it"
          }
        }
      },
      SendMessageRequest: {
        type: "object",
        required: ["to", "message"],
        additionalProperties: false,
        properties: {
          to: {
            type: "string",
            pattern: "^\\+[1-9]\\d{1,14}$",
            description: "One E.164 phone number. Group recipients are unsupported.",
            example: "+15555555555"
          },
          message: {
            type: "string",
            minLength: 1,
            maxLength: 1000,
            example: "Time to lock in."
          },
          fromPhone: {
            type: "string",
            pattern: "^\\+[1-9]\\d{1,14}$",
            description: "Optional E.164 sender/agent phone for multi-phone Photon projects.",
            example: "+14156035536"
          }
        }
      },
      SendMessageResponse: {
        type: "object",
        required: ["sent", "provider", "platform", "to"],
        properties: {
          sent: {
            type: "boolean",
            example: true
          },
          provider: {
            type: "string",
            enum: ["photon"]
          },
          platform: {
            type: "string",
            enum: ["imessage"]
          },
          to: {
            type: "string",
            example: "+15555555555"
          },
          fromPhone: {
            type: "string",
            example: "+14156035536"
          },
          messageId: {
            type: "string",
            example: "msg_123"
          },
          spaceId: {
            type: "string",
            example: "space_123"
          }
        }
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: {
                type: "string",
                example: "internal_error"
              },
              message: {
                type: "string",
                example: "Internal server error"
              }
            }
          }
        }
      },
      ValidationErrorResponse: {
        allOf: [
          {
            $ref: "#/components/schemas/ErrorResponse"
          },
          {
            type: "object",
            properties: {
              error: {
                type: "object",
                properties: {
                  issues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        path: {
                          type: "string",
                          example: "to"
                        },
                        message: {
                          type: "string",
                          example: "Use one E.164 phone number, e.g. +15555555555"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    }
  }
} as const;

export const swaggerHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zenly API Docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    </script>
  </body>
</html>`;
