import { google } from "googleapis";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
const TOKEN_PATH = path.join(__dirname, "token.json");

function getAuth() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } =
    credentials.web || credentials.installed;

  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const auth = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );
  auth.setCredentials(token);
  return auth;
}

export async function uploadFileToDrive(filename, filepath) {
  try {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [], // Root
      },
      media: {
        mimeType: "application/octet-stream",
        body: fs.createReadStream(filepath),
      },
    });

    console.log(`Đã upload file "${filename}" vào Google Drive gốc`);
    return res.data;
  } catch (err) {
    console.error(`Lỗi upload file "${filename}":`, err.message);
    throw err;
  }
}

export async function uploadFileToDriveWithPath({
  root,
  subfolders = [],
  filename,
  filepath,
}) {
  try {
    const auth = getAuth();
    const drive = google.drive({ version: "v3", auth });

    let parentId = await findOrCreateFolder(drive, root, null);
    for (const folder of subfolders) {
      parentId = await findOrCreateFolder(drive, folder, parentId);
    }

    const res = await drive.files.create({
      requestBody: {
        name: filename,
        parents: [parentId],
      },
      media: {
        mimeType: "application/octet-stream",
        body: fs.createReadStream(filepath),
      },
    });

    console.log(
      `Uploaded "${filename}" vào thư mục: ${[root, ...subfolders].join("/")}`
    );
    return res.data;
  } catch (err) {
    console.error(`❌ Lỗi upload file "${filename}":`, err.message);
    throw err;
  }
}

async function findOrCreateFolder(drive, name, parentId) {
  const query = [
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${name}'`,
    parentId ? `'${parentId}' in parents` : `'root' in parents`,
  ].join(" and ");

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : [],
    },
    fields: "id",
  });

  console.log(`Đã tạo thư mục "${name}"`);
  return folder.data.id;
}
