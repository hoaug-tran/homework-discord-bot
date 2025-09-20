import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { run as uploadExpired } from "../Runner/uploadExpired.js";
import { setBotAvatarIfNeeded } from "./avatarSet.js";
import { initReminderScheduler } from "../Commands/scheduler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const DATA_DIR = path.join(__dirname, "../Data");
const COMMANDS_DIR = path.join(__dirname, "../Commands");
const UPLOADED_LOG = path.join(DATA_DIR, "uploaded.json");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  presence: {
    status: "online",
    activities: [
      {
        name: "các cậu nộp bài ... 😴",
        type: 3,
      },
    ],
  },
});

client.commands = new Collection();

export async function scheduleUpload(baitap) {
  const deadline = new Date(baitap.deadline);
  const now = new Date();

  if (!baitap.id || !baitap.deadline) return;

  let uploaded = {};
  try {
    uploaded = await fs.readJson(UPLOADED_LOG);
  } catch {
    uploaded = {};
  }

  if (uploaded[baitap.id]) {
    console.log(`Bài #${baitap.id} đã được upload. Bỏ qua.`);
    return;
  }

  const handleUpload = async () => {
    console.log(`Bài #${baitap.id} đã hết hạn, bắt đầu upload...`);
    try {
      await uploadExpired(baitap.id);
      uploaded[baitap.id] = true;
      await fs.writeJson(UPLOADED_LOG, uploaded, { spaces: 2 });
      console.log(`Đã upload bài #${baitap.id}`);
    } catch (err) {
      console.error(`Lỗi khi upload bài ${baitap.id}:`, err);
    }
  };

  if (now >= deadline) {
    await handleUpload();
  } else {
    const timeLeft = deadline.getTime() - now.getTime();
    console.log(
      `Đặt hẹn upload bài #${baitap.id} sau ${Math.round(timeLeft / 1000)} giây`
    );
    setTimeout(handleUpload, timeLeft);
  }
}

async function main() {
  const commandFiles = (await fs.readdir(COMMANDS_DIR)).filter(
    (file) => file.endsWith(".js") && file !== "scheduler.js"
  );

  for (const file of commandFiles) {
    const filePath = path.join(COMMANDS_DIR, file);
    const command = await import(`file://${filePath}`);
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`Loaded command: ${command.data.name}`);
    } else {
      console.warn(`Lệnh thiếu 'data' hoặc 'execute' trong ${file}`);
    }
  }

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Bot đã sẵn sàng! Logged in as ${readyClient.user.tag}`);

    await setBotAvatarIfNeeded(client);
    await initReminderScheduler(client);

    await fs.ensureFile(UPLOADED_LOG);

    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("Không có bài tập nào trong thư mục Data.");
      return;
    }

    for (const file of jsonFiles) {
      const dataPath = path.join(DATA_DIR, file);
      const baitap = await fs.readJson(dataPath);
      await scheduleUpload(baitap);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(
            `❌ Lỗi autocomplete cho ${interaction.commandName}:`,
            error
          );
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`❌ Không tìm thấy lệnh ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Lỗi khi xử lý lệnh ${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Đã xảy ra lỗi khi xử lý lệnh.",
          flags: 1 << 6,
        });
      } else {
        await interaction.reply({
          content: "Đã xảy ra lỗi khi xử lý lệnh.",
          flags: 1 << 6,
        });
      }
    }
  });

  client.login(process.env.BOT_TOKEN).catch((err) => {
    console.error("❌ Lỗi khi đăng nhập bot:", err);
  });
}

main().catch((err) => {
  console.error("❌ Lỗi khởi chạy bot:", err);
});
