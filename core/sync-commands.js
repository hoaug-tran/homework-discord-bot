import { REST, Routes } from "discord.js";
import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error("? Thiếu BOT_TOKEN, CLIENT_ID hoặc GUILD_ID trong .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

async function loadCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, "../commands");

  if (!fs.existsSync(commandsPath)) {
    console.error("? Không tìm thấy thư mục Commands:", commandsPath);
    return commands;
  }

  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const modulePath = "file://" + path.resolve(filePath).replace(/\\/g, "/");

    try {
      const command = await import(modulePath);
      if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
        console.log(`? Loaded command: ${command.data.name}`);
      } else {
        console.warn(`?? Lệnh ${file} thiếu 'data' hoặc 'execute'`);
      }
    } catch (err) {
      console.error(`? Lỗi khi import lệnh ${file}:`, err);
    }
  }

  return commands;
}

async function deleteGuildCommands() {
  try {
    console.log("?? Đang xoá toàn bộ GUILD commands...");
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: [] }
    );
    console.log("? Đang xoá toàn bộ GUILD commands");
  } catch (error) {
    console.error("? Lỗi khi xoá GUILD commands:", error);
  }
}

async function deployGlobalCommands() {
  const commands = await loadCommands();
  if (!commands.length) {
    console.warn("?? Không có lệnh nào để deploy.");
    return;
  }

  try {
    console.log("?? Đang deploy Global Commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });
    console.log("? Deploy thành công Global Commands!");
  } catch (error) {
    console.error("? Lỗi khi deploy global:", error);
  }
}

async function main() {
  await deleteGuildCommands();
  await deployGlobalCommands();
}

main().catch((err) => {
  console.error("? Lỗi:", err);
});
