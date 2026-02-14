const fs = require("fs");
const path = require("path");

const targetDir = "./src";
const importLine = `import { MessageFlags } from "discord.js";\n`;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  if (!content.includes("MessageFlags.Ephemeral")) return;
  if (content.includes(importLine.trim())) return;

  // Insert after the last import statement
  const lines = content.split("\n");
  const lastImportIndex = lines.reduce((acc, line, i) => line.startsWith("import") ? i : acc, -1);

  lines.splice(lastImportIndex + 1, 0, importLine.trim());
  const newContent = lines.join("\n");

  fs.writeFileSync(filePath, newContent, "utf8");
  console.log(`✅ Updated: ${filePath}`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && fullPath.endsWith(".ts")) {
      processFile(fullPath);
    }
  }
}

walk(targetDir);
