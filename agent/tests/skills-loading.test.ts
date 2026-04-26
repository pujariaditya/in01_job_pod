import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "..", ".pi", "skills", "strategies");

describe("strategy skills", () => {
  it("ships at least one strategy markdown", () => {
    const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("each skill has a YAML frontmatter block with strategy contract fields", () => {
    const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const content = readFileSync(join(SKILLS_DIR, f), "utf-8");
      const m = content.match(/^---\n([\s\S]*?)\n---/);
      expect(m, `${f} missing YAML frontmatter`).not.toBeNull();
      expect(m![1], `${f} missing name`).toMatch(/^name:\s*\S+/m);
      expect(m![1], `${f} missing priority`).toMatch(/^priority:\s*\d+/m);
      expect(m![1], `${f} missing requires_regimes`).toMatch(/^requires_regimes:\s*\[/m);
      expect(m![1], `${f} missing requires_tools`).toMatch(/^requires_tools:\s*\[/m);
    }
  });

  it("each skill starts with frontmatter delimiter", () => {
    const files = readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const content = readFileSync(join(SKILLS_DIR, f), "utf-8");
      expect(content.startsWith("---\n"), `${f} must start with frontmatter`).toBe(true);
    }
  });
});
