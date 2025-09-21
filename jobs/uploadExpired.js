import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { uploadFileToDriveWithPath } from "../GGDriveAPI/drive.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../Data");
const SUBMISSIONS_DIR = path.join(__dirname, "../Submissions");
const ROOT_GDRIVE_FOLDER = "Bài tập đã nộp";

export async function run(targetId = null) {
  const files = await fs.readdir(DATA_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  for (const file of jsonFiles) {
    const dataPath = path.join(DATA_DIR, file);
    const assignment = await fs.readJson(dataPath);

    if (!assignment.id || !assignment.deadline) continue;
    if (targetId && assignment.id !== targetId) continue;

    const deadline = new Date(assignment.deadline);
    if (Date.now() < deadline.getTime()) continue;

    const title =
      assignment.noidung?.toString().slice(0, 50) || "Không rõ nội dung";
    const folderName = `${assignment.id} - ${title.replace(
      /[\\/:"*?<>|]/g,
      "_"
    )}`;
    const submissionDir = path.join(SUBMISSIONS_DIR, assignment.id);

    if (!(await fs.pathExists(submissionDir))) {
      console.log(`⚠️ Không có thư mục bài nộp cho #${assignment.id}.`);
      continue;
    }

    const userFolders = await fs.readdir(submissionDir);
    if (userFolders.length === 0) {
      console.log(`⚠️ Không có bài nộp nào trong #${assignment.id}.`);
      continue;
    }

    for (const userFolder of userFolders) {
      const userPath = path.join(submissionDir, userFolder);
      const userFiles = await fs.readdir(userPath);

      for (const filename of userFiles) {
        const filepath = path.join(userPath, filename);
        console.log(`📤 Uploading: ${filepath}`);

        await uploadFileToDriveWithPath({
          root: ROOT_GDRIVE_FOLDER,
          subfolders: [folderName, userFolder],
          filename,
          filepath,
        });
      }
    }
  }
}
