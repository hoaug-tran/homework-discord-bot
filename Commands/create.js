import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from "fs-extra";
import path from "path";
import ms from "ms";
import { fileURLToPath } from "url";
import { scheduleUpload } from "../Main/bot.js";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../Data");

export const data = new SlashCommandBuilder()
  .setName("tao")
  .setDescription("Tạo một bài tập mới")
  .addStringOption((option) =>
    option
      .setName("noidung")
      .setDescription("Nội dung bài tập")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("han")
      .setDescription("Hạn nộp bài (HH:mm dd/mm/yyyy)")
      .setRequired(true)
  )
  .addBooleanOption((option) =>
    option
      .setName("testcase")
      .setDescription("Bài có chấm test case?")
      .setRequired(true)
  )
  .addAttachmentOption((option) =>
    option.setName("anh").setDescription("Ảnh minh họa (tuỳ chọn)")
  )
  .addAttachmentOption((option) =>
    option.setName("tep").setDescription("Tệp như .docx, .pdf (tuỳ chọn)")
  );

export async function execute(interaction) {
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  const FIXED_ROLE_ID = process.env.FIXED_ROLE_ID;
  const ALLOW_CHANNEL_ID = process.env.ALLOW_CHANNEL_ID;

  if (interaction.channelId !== ALLOW_CHANNEL_ID) {
    return interaction.reply({
      content:
        "🚫 Lệnh này chỉ được sử dụng tại kênh <#" + ALLOW_CHANNEL_ID + ">.",
      flags: 1 << 6,
    });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
    return interaction.reply({
      content: "🚫 Bạn không có quyền sử dụng lệnh này.",
      flags: 1 << 6,
    });
  }

  const noidung = interaction.options.getString("noidung");
  const hanStr = interaction.options.getString("han");

  let deadlineRaw;
  let deadlineDate;

  try {
    const parts = hanStr.trim().split(" ");
    let hour, minute, day, month, year;

    if (parts.length === 1 && /^\d{1,2}:\d{2}$/.test(parts[0])) {
      [hour, minute] = parts[0].split(":").map(Number);
      const now = new Date();
      day = now.getDate();
      month = now.getMonth() + 1;
      year = now.getFullYear();
    } else if (parts.length === 2) {
      const [hStr, dStr] = parts;
      [hour, minute] = hStr.split(":").map(Number);
      [day, month, year] = dStr.split("/").map(Number);
    } else throw new Error();

    if ([hour, minute, day, month, year].some(isNaN)) throw new Error();

    deadlineDate = new Date(year, month - 1, day, hour, minute);
    deadlineRaw = deadlineDate.toISOString();

    if (deadlineDate.getTime() <= Date.now()) {
      return interaction.reply({
        content: "❌ Hạn nộp bài phải nằm trong tương lai.",
        flags: 1 << 6,
      });
    }
  } catch {
    return interaction.reply({
      content:
        "❌ Hạn nộp bài không hợp lệ. Nhập theo `HH:mm` hoặc `HH:mm dd/mm/yyyy`",
      flags: 1 << 6,
    });
  }

  const hasTestCase = interaction.options.getBoolean("testcase");

  const img = interaction.options.getAttachment("anh");
  const file = interaction.options.getAttachment("tep");

  const files = await fs.readdir(DATA_DIR);
  const existingIds = files.map((f) => f.replace(".json", ""));

  let id;
  do {
    id = `bt_${Math.floor(1000 + Math.random() * 9000)}`;
  } while (existingIds.includes(id));

  const savePath = path.join(DATA_DIR, `${id}.json`);

  const baitap = {
    id,
    author: interaction.user.id,
    noidung,
    deadline: deadlineRaw,
    imgUrl: img?.url || null,
    fileUrl: file?.url || null,
    hasTestCase,
    submissions: {},
    createdAt: Date.now(),
  };

  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(savePath, baitap, { spaces: 2 });

  await scheduleUpload(baitap);

  const deadlineFull =
    deadlineDate.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) +
    " " +
    deadlineDate
      .toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/^./, (c) => c.toUpperCase());

  const timeLeftMs = deadlineDate.getTime() - Date.now();
  const relativeTime =
    timeLeftMs > 0 ? formatTimeLeft(timeLeftMs) : "Đã hết thời gian nộp bài";

  function formatTimeLeft(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts = [];
    if (days > 0) parts.push(`${days} ngày`);
    if (hours > 0) parts.push(`${hours} giờ`);
    if (minutes > 0) parts.push(`${minutes} phút`);
    if (seconds > 0 && parts.length === 0) parts.push(`${seconds} giây`);
    return parts.join(" ");
  }

  const embed = new EmbedBuilder()
    .setTitle("BÀI TẬP MỚI")
    .setDescription(`> ${noidung}`)
    .setColor(0x0099ff)
    .addFields(
      { name: "ID bài tập", value: id, inline: false },
      {
        name: "Thời gian",
        value: `Hạn: \`${deadlineFull}\`\nCòn lại: \`${relativeTime}\``,
        inline: false,
      },
      {
        name: "Test case",
        value: hasTestCase ? "Có test case" : "Không có test case",
        inline: false,
      }
    )
    .setFooter({ text: `Người tạo: ${interaction.user.tag}` })
    .setTimestamp();

  if (img) embed.setImage(img.url);
  if (file)
    embed.addFields({
      name: "File đính kèm",
      value: `[Tải xuống](${file.url})`,
      inline: false,
    });

  await interaction.reply({ embeds: [embed] });
}
