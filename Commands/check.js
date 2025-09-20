import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../Data");
const UPLOADED_LOG_PATH = path.join(DATA_DIR, "uploaded.json");

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("check")
  .setDescription("Kiểm tra trạng thái nộp bài và upload Google Drive")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("Chọn ID bài tập")
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function execute(interaction) {
  function formatTimeVN(dateStr) {
    const d = new Date(dateStr);
    const hoursVN = (d.getUTCHours() + 7) % 24;
    const pad = (n) => n.toString().padStart(2, "0");
    return `${pad(hoursVN)}:${pad(d.getUTCMinutes())} ${pad(
      d.getUTCDate()
    )}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }

  const ALLOW_CHANNEL_ID = process.env.ALLOW_CHANNEL_ID;

  if (interaction.channelId !== ALLOW_CHANNEL_ID) {
    return interaction.reply({
      content: `🚫 Lệnh này chỉ được sử dụng tại kênh <#${ALLOW_CHANNEL_ID}>.`,
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

  await interaction.deferReply();

  let id = interaction.options.getString("id");

  if (!id) {
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter(
      (f) => f.startsWith("bt_") && f.endsWith(".json")
    );

    if (jsonFiles.length === 0) {
      return interaction.editReply({
        content: "❌ Hiện không có bài tập nào để kiểm tra.",
      });
    }

    const filesWithCreatedAt = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const data = await fs.readJson(path.join(DATA_DIR, file));
          return { file, createdAt: data.createdAt || 0 };
        } catch {
          return { file, createdAt: 0 };
        }
      })
    );

    filesWithCreatedAt.sort((a, b) => b.createdAt - a.createdAt);

    id = filesWithCreatedAt[0]?.file.replace(".json", "");
  }

  const filePath = path.join(DATA_DIR, `${id}.json`);
  if (!(await fs.pathExists(filePath))) {
    return interaction.editReply({
      content: `❌ Không tìm thấy bài tập với ID \`${id}\``,
    });
  }

  const assignment = await fs.readJson(filePath);
  const uploaded = await fs.readJson(UPLOADED_LOG_PATH).catch(() => ({}));
  const isUploaded = !!uploaded[assignment.id];

  const FIXED_ROLE_ID = process.env.FIXED_ROLE_ID;

  const allMembers = await interaction.guild.members.fetch();
  const eligibleUserIds = allMembers
    .filter((m) => m.roles.cache.has(FIXED_ROLE_ID))
    .map((m) => m.id);

  const submissions = assignment.submissions || {};

  const submittedList = [];
  const submittedUserIdsPassed = [];

  for (const userId of eligibleUserIds) {
    const info = submissions[userId];
    if (!info) continue;

    const isAccepted =
      assignment.hasTestCase === true ? info.passed === true : true;

    if (isAccepted) {
      let times = 1;
      let lastTimestamp = info.timestamp;
      if (Array.isArray(info.files) && info.files.length > 0) {
        times = info.files.length;
        lastTimestamp = info.files.at(-1)?.timestamp;
      }
      if (!lastTimestamp) lastTimestamp = info.timestamp;
      submittedUserIdsPassed.push(userId);
      submittedList.push({
        userId,
        times,
        lastTimestamp,
      });
    }
  }

  submittedList.sort(
    (a, b) => new Date(a.lastTimestamp) - new Date(b.lastTimestamp)
  );

  const submittedLines = submittedList.map(
    (u, i) =>
      `${i + 1}. <@${u.userId}> - \`${formatTimeVN(
        u.lastTimestamp
      )}\` - \`số lần nộp: ${u.times}\``
  );

  const unsubmittedEligible = eligibleUserIds.filter(
    (id) => !submittedUserIdsPassed.includes(id)
  );

  const unsubmittedLines = unsubmittedEligible.map(
    (userId, i) => `${i + 1}. <@${userId}>`
  );

  const deadline = new Date(assignment.deadline);
  const now = new Date();
  const timeLeftMs = deadline - now;

  function formatTimeLeft(ms) {
    const absMs = Math.abs(ms);
    const seconds = Math.floor(absMs / 1000) % 60;
    const minutes = Math.floor(absMs / (1000 * 60)) % 60;
    const hours = Math.floor(absMs / (1000 * 60 * 60)) % 24;
    const days = Math.floor(absMs / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days} ngày`);
    if (hours > 0) parts.push(`${hours} giờ`);
    if (minutes > 0) parts.push(`${minutes} phút`);
    if (seconds > 0 && parts.length === 0) parts.push(`${seconds} giây`);

    return parts.join(" ");
  }

  const deadlineFormatted =
    deadline.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) +
    " " +
    deadline.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const relativeDeadline =
    timeLeftMs > 0 ? formatTimeLeft(timeLeftMs) : "Đã hết thời gian nộp bài";

  const embed = new EmbedBuilder()
    .setTitle(`DANH SÁCH TRẠNG THÁI NỘP BÀI - #${assignment.id}`)
    .setDescription(
      `> ${assignment.noidung.slice(0, 100)}${
        assignment.noidung.length > 100 ? "..." : ""
      }`
    )
    .setColor(isUploaded ? 0x2ecc71 : 0xf39c12)
    .addFields(
      {
        name: "Thời gian",
        value: `Hạn nộp bài: \`${deadlineFormatted}\`\nThời gian còn lại: \`${relativeDeadline}\``,
        inline: false,
      },
      {
        name: "Trạng thái upload",
        value: isUploaded
          ? "Đã upload lên Google Drive"
          : "Chưa upload lên Google Drive",
        inline: false,
      },
      {
        name: "Tổng quan",
        value: `Đã nộp: \`${submittedUserIdsPassed.length} / ${eligibleUserIds.length}\``,
        inline: false,
      },
      {
        name: "Thống kê chi tiết",
        value:
          `Đã nộp bài (${submittedUserIdsPassed.length})\n` +
          (submittedLines.length > 0
            ? submittedLines.join("\n")
            : "*Không có ai nộp cả.*") +
          `\n\nChưa nộp bài (${unsubmittedLines.length})\n` +
          (unsubmittedLines.length > 0
            ? unsubmittedLines.join("\n")
            : "*Tất cả đã nộp rồi. Ngoan quá nhỉ.*"),
        inline: false,
      }
    )
    .setFooter({
      text: `Gọi bởi: ${interaction.user.tag}`,
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const files = await fs.readdir(DATA_DIR);
  const jsonFiles = files.filter(
    (f) => f.endsWith(".json") && f.startsWith("bt_")
  );

  const choices = await Promise.all(
    jsonFiles.map(async (file) => {
      try {
        const data = await fs.readJson(path.join(DATA_DIR, file));
        return {
          name: `Bài #${data.id} | ${(
            data.noidung || "Đề không có nội dung."
          ).slice(0, 50)}`,
          value: data.id,
        };
      } catch {
        return null;
      }
    })
  );

  const filtered = choices
    .filter(Boolean)
    .filter((c) => c.value.toLowerCase().includes(focused.toLowerCase()));

  await interaction.respond(filtered.slice(0, 25));
}
