import fs from "fs";
import path from "path";
import readline from "readline";

const ENV_PATH = path.resolve(process.cwd(), ".env");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  if (fs.existsSync(ENV_PATH)) {
    console.log("File .env đã tồn tại.");
    rl.close();
    return;
  }

  console.log("Thiết lập file .env lần đầu...");

  const BOT_TOKEN = await ask("Nhập Discord Bot Token: ");
  const CLIENT_ID = await ask("Nhập Discord Client ID: ");
  const GUILD_ID = await ask("Nhập Discord Server ID: ");
  const ADMIN_ROLE_ID = await ask("Nhập Role ID của Teacher: ");
  const FIXED_ROLE_ID = await ask("Nhập Role ID của Student: ");
  const ALLOW_CHANNEL_ID = await ask("Nhập Channel ID cho phép dùng lệnh: ");

  const useDrive = (
    await ask("Bạn có muốn kết nối Google Drive? (y/n): ")
  ).toLowerCase();
  let GGDRIVE_CLIENT_ID = "";
  let GGDRIVE_SECRET_ID = "";

  if (useDrive === "y") {
    GGDRIVE_CLIENT_ID = await ask("Nhập Google Drive Client ID: ");
    GGDRIVE_SECRET_ID = await ask("Nhập Google Drive Secret ID: ");
  }

  rl.close();

  const content = `BOT_TOKEN=${BOT_TOKEN}
CLIENT_ID=${CLIENT_ID}
GUILD_ID=${GUILD_ID}
ADMIN_ROLE_ID=${ADMIN_ROLE_ID}
FIXED_ROLE_ID=${FIXED_ROLE_ID}
ALLOW_CHANNEL_ID=${ALLOW_CHANNEL_ID}
GGDRIVE_CLIENT_ID=${GGDRIVE_CLIENT_ID}
GGDRIVE_SECRET_ID=${GGDRIVE_SECRET_ID}
`;

  fs.writeFileSync(ENV_PATH, content.trim() + "\n");
  console.log("Tạo file .env thành công!");
}

main();
