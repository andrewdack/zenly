import { describe, expect, it } from "vitest";
import { focusJudgeSystem } from "../src/prompts.js";

describe("focusJudgeSystem", () => {
  it("keeps neutral surfaces allowed in guardian mode", () => {
    const prompt = focusJudgeSystem("guardian", null);
    expect(prompt).toContain("neutral / utility / transient surfaces");
    expect(prompt).toContain("Spotify, Apple Music, or any music player");
    expect(prompt).toContain("If the screen is a neutral / utility / transient surface from the allowlist, return \"ok\"");
    expect(prompt).toContain("Only mark \"destructive\" when active feed/game/gambling engagement is unambiguous");
  });

  it("uses strict task-mode decision order for obvious entertainment", () => {
    const prompt = focusJudgeSystem("task", "scholarship research");
    expect(prompt).toContain("Decision order");
    expect(prompt).toContain("Clearly relates to the task");
    expect(prompt).toContain("Intentional\" does NOT excuse unrelated entertainment in task mode");
    expect(prompt).toContain("Use \"off_task\" for other unrelated entertainment or streaming");
    expect(prompt).toContain("Genuinely ambiguous / cannot tell → \"on_task\"");
  });
});
