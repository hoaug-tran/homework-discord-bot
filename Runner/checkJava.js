import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMP_DIR_BASE = path.join(__dirname, "../temp");

export async function runJavaCheck(filepath, idBt, userId) {
  const tmpDir = path.join(TEMP_DIR_BASE, `${userId}_${Date.now()}`);
  await fs.ensureDir(tmpDir);

  let javaFiles = [];
  const classNameBase = `U${userId}_${Date.now()}`;

  try {
    if (filepath.endsWith(".zip")) {
      const zip = new AdmZip(filepath);
      zip.extractAllTo(tmpDir, true);

      const files = await fs.readdir(tmpDir);
      const rawJavaFiles = files.filter((f) => f.endsWith(".java"));

      for (let i = 0; i < rawJavaFiles.length; i++) {
        const oldPath = path.join(tmpDir, rawJavaFiles[i]);
        const content = await fs.readFile(oldPath, "utf8");
        const newClassName = `${classNameBase}_${i}`;
        const newContent = content.replace(
          /public\s+class\s+\w+/,
          `public class ${newClassName}`
        );
        const newFileName = `${newClassName}.java`;

        const newPath = path.join(tmpDir, newFileName);
        await fs.writeFile(newPath, newContent);
        javaFiles.push(newFileName);
      }
    } else if (filepath.endsWith(".java")) {
      const content = await fs.readFile(filepath, "utf8");
      const newClassName = classNameBase;
      const newContent = content.replace(
        /public\s+class\s+\w+/,
        `public class ${newClassName}`
      );
      const newFileName = `${newClassName}.java`;
      const destPath = path.join(tmpDir, newFileName);
      await fs.writeFile(destPath, newContent);
      javaFiles = [newFileName];
    } else {
      return {
        pass: false,
        message: "File không hợp lệ. Chỉ hỗ trợ .java hoặc .zip",
      };
    }

    const compileCmd = `javac ${javaFiles.map((f) => `\"${f}\"`).join(" ")}`;
    await execPromise(compileCmd, { cwd: tmpDir });

    let mainClass = null;
    for (const f of javaFiles) {
      const content = await fs.readFile(path.join(tmpDir, f), "utf8");
      if (content.includes("public static void main")) {
        mainClass = path.basename(f, ".java");
        break;
      }
    }

    if (!mainClass) {
      return {
        pass: false,
        message: "Không tìm thấy hàm `main` trong bất kỳ file nào.",
      };
    }

    const testcasePath = path.join(__dirname, `../Testcases/${idBt}.json`);
    if (!(await fs.pathExists(testcasePath))) {
      return {
        pass: false,
        message: `Không tìm thấy test case cho bài \`${idBt}\`.`,
      };
    }

    const testcases = await fs.readJson(testcasePath);
    const runCmd = `java -Xms32m -Xmx64m -cp . ${mainClass}`;

    for (const test of testcases) {
      try {
        const output = await execPromise(runCmd, {
          cwd: tmpDir,
          input: test.input,
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        });

        if (output.trim() !== test.expected.trim()) {
          return {
            pass: false,
            message: `❌ Test case thất bại:\n**Input:** \`${test.input.trim()}\`\n**Output:** \`${output.trim()}\`\n**Expected:** \`${test.expected.trim()}\``,
          };
        }
      } catch (err) {
        return {
          pass: false,
          message: `Lỗi khi chạy code:\n\
${err.message || err.stderr || "Unknown error"}`,
        };
      }
    }

    return { pass: true, message: "✅ Tất cả test case đều đúng 🎉" };
  } finally {
    await fs.remove(tmpDir);
  }
}

function execPromise(command, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = exec(command, options, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
    if (options.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }
  });
}
