import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const webDist = path.join(root, "apps", "web", "dist");
const apiPublic = path.join(root, "apps", "api", "public");

if (!fs.existsSync(webDist)) {
  console.error("Web dist не найден:", webDist);
  process.exit(1);
}

fs.rmSync(apiPublic, { recursive: true, force: true });
fs.mkdirSync(apiPublic, { recursive: true });

const copyDir = (src, dst) => {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dst, ent.name);
    if (ent.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
};

copyDir(webDist, apiPublic);
console.log("✅ Web build скопирован в apps/api/public");
