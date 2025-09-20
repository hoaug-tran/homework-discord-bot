import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from "fs-extra";
import path from "path";
import { runJavaCheck } from "../Runner/checkJava.js";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../Data");
const SUBMISSIONS_DIR = path.join(__dirname, "../Submissions");

export const data = new SlashCommandBuilder()
  .setName("nop")
  .setDescription("Nộp bài tập")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("Chọn ID bài tập để nộp")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addAttachmentOption((option) =>
    option
      .setName("tep")
      .setDescription("Tệp nộp (.java hoặc .zip)")
      .setRequired(true)
  );

export async function execute(interaction) {
  const FIXED_ROLE_ID = process.env.FIXED_ROLE_ID;
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  const ALLOW_CHANNEL_ID = process.env.ALLOW_CHANNEL_ID;

  if (interaction.channelId !== ALLOW_CHANNEL_ID) {
    return interaction.reply({
      content:
        "🚫 Lệnh này chỉ được sử dụng tại kênh <#" + ALLOW_CHANNEL_ID + ">.",
      flags: 1 << 6,
    });
  }

  await interaction.deferReply({ flags: 1 << 6 });

  const userId = interaction.user.id;
  const username = interaction.user.username;
  const idBt = interaction.options.getString("id");
  const file = interaction.options.getAttachment("tep");

  const filePath = path.join(DATA_DIR, `${idBt}.json`);
  if (!(await fs.pathExists(filePath))) {
    return interaction.editReply({
      content: "❌ Không tìm thấy bài tập.",
      flags: 1 << 6,
    });
  }

  const assignment = await fs.readJson(filePath);

  const member = await interaction.guild.members.fetch(userId);

  const memberRoles = [...member.roles.cache.keys()];

  const isRoleAllowed =
    memberRoles.includes(FIXED_ROLE_ID) || assignment.author === userId;

  if (!isRoleAllowed) {
    return interaction.editReply({
      content: `❌ Bạn không có quyền nộp bài tập này. Nếu có thắc mắc, hãy liên hệ với <@582820777787916289>`,
      flags: 1 << 6,
    });
  }

  const now = new Date();
  const deadline = new Date(assignment.deadline);

  if (now > deadline) {
    const overdueMs = now - deadline;
    return interaction.editReply({
      content: `❌ Đã hết thời gian nộp bài ${formatTimeLeft(overdueMs)} trước`,
      flags: 1 << 6,
    });
  }

  if (assignment.submissions?.[userId]?.passed) {
    return interaction.editReply({
      content:
        "✅ Bạn đã nộp bài và bài bạn nộp hoàn toàn chính xác. Không cần nộp lại làm gì.",
      flags: 1 << 6,
    });
  }

  const ext = path.extname(file.name);
  const userNameSanitized = username.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  const userFolder = `${userNameSanitized}_${userId}`;
  const userDir = path.join(SUBMISSIONS_DIR, idBt, userFolder);

  await fs.ensureDir(userDir);
  await fs.emptyDir(userDir);
  const savePath = path.join(userDir, file.name);

  const res = await fetch(file.url);

  if (ext === ".java") {
    const content = await res.text();
    const className = path.basename(file.name, ".java");
    const newContent = content.replace(
      /public\s+class\s+\w+/,
      `public class ${className}`
    );
    await fs.writeFile(savePath, newContent);
  } else {
    const buffer = await res.arrayBuffer();
    await fs.writeFile(savePath, Buffer.from(buffer));
  }

  let passed = false;
  let testResult = null;

  if (assignment.hasTestCase) {
    testResult = await runJavaCheck(savePath, assignment.id, userId);
    passed = testResult.pass;
  }

  assignment.submissions = assignment.submissions || {};

  const currentSubmit = {
    timestamp: new Date().toISOString(),
    passed,
  };

  if (
    assignment.submissions[userId] &&
    Array.isArray(assignment.submissions[userId].files)
  ) {
    assignment.submissions[userId].files.push(currentSubmit);
    assignment.submissions[userId].passed = passed;
    assignment.submissions[userId].timestamp = currentSubmit.timestamp;
  } else {
    assignment.submissions[userId] = {
      files: [currentSubmit],
      passed,
      timestamp: currentSubmit.timestamp,
    };
  }

  await fs.writeJson(filePath, assignment, { spaces: 2 });

  const REMINDER_PATH = path.join(DATA_DIR, "reminders.json");
  const reminders = await fs.readJson(REMINDER_PATH).catch(() => ({}));

  if (reminders[assignment.id]?.[userId]) {
    delete reminders[assignment.id][userId];

    if (Object.keys(reminders[assignment.id]).length === 0) {
      delete reminders[assignment.id];
    }

    await fs.writeJson(REMINDER_PATH, reminders, { spaces: 2 });
  }

  const submittedAt = new Date();

  const submittedFull =
    submittedAt.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) +
    " " +
    submittedAt
      .toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/^./, (c) => c.toUpperCase());

  const deadlineFull =
    deadline.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) +
    " " +
    deadline
      .toLocaleDateString("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
      .replace(/^./, (c) => c.toUpperCase());

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

  let statusTitle, statusColor, statusContent;

  if (passed) {
    statusTitle = "NỘP BÀI THÀNH CÔNG";
    statusColor = 0x2ecc71;
    statusContent =
      "```diff\n+ Bạn đã làm đúng toàn bộ test case!\n+ Làm tốt lắm !\n```";
  } else if (assignment.hasTestCase) {
    statusTitle = "NỘP BÀI THẤT BẠI";
    statusColor = 0xe74c3c;
    statusContent = `\`\`\`diff\n- Bài làm chưa đúng yêu cầu\n- ${testResult.message}\n\`\`\``;
  } else {
    statusTitle = "NỘP BÀI THÀNH CÔNG";
    statusColor = 0x2ecc71;
    statusContent = "```ini\nĐã lưu bài nộp (không tự động chấm điểm)\n```";
  }

  let thumbnailUrl;
  if (ext === ".java") {
    thumbnailUrl = "https://cdn-icons-png.flaticon.com/512/226/226777.png";
  } else if (ext === ".zip") {
    thumbnailUrl = "https://cdn-icons-png.flaticon.com/512/28/28814.png";
  } else {
    thumbnailUrl = "https://cdn-icons-png.flaticon.com/512/2246/2246713.png";
  }

  const embed = new EmbedBuilder()
    .setTitle(`${statusTitle} -  #${assignment.id}`)
    .setColor(statusColor)
    .setThumbnail(thumbnailUrl)
    .setDescription(
      `> ${assignment.noidung.slice(0, 100)}${
        assignment.noidung.length > 100 ? "..." : ""
      }`
    )
    .addFields(
      {
        name: "Thời gian",
        value: `Đã nộp lúc: \`${submittedFull}\``,
        inline: false,
      },
      {
        name: "Thông tin",
        value: `Loại tệp: \`${ext}\`\nKích thước: \`${(
          file.size / 1024
        ).toFixed(1)} KB\``,
        inline: true,
      },
      {
        name: "Trạng thái",
        value: statusContent,
        inline: false,
      },
      {
        name: "Tệp đã lưu",
        value: `\`\`\`\n${path.basename(savePath)}\n\`\`\``,
        inline: false,
      }
    )
    .setFooter({
      text: `Nộp bởi: ${username} • ID: ${userId.slice(-5)}`,
      iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
    })
    .setTimestamp();

  if (!passed && assignment.hasTestCase) {
    embed.addFields({
      name: "Gợi ý",
      value:
        "- Nếu lỗi là **không tìm thấy test case, ...** thì hãy nhắn tin cho <@582820777787916289>.\n" +
        "- Nếu lỗi là **compile error, ...** thì đó là do code của bạn sai.",
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const userId = interaction.user.id;
  const jsonFiles = (await fs.readdir(DATA_DIR)).filter(
    (f) => f.startsWith("bt_") && f.endsWith(".json")
  );

  const now = Date.now();

  const choices = await Promise.all(
    jsonFiles.map(async (file) => {
      try {
        const data = await fs.readJson(path.join(DATA_DIR, file));
        const sub = data.submissions?.[userId];
        const deadline = new Date(data.deadline).getTime();
        const isExpired = now > deadline;

        let statusLabel = "";

        if (sub) {
          statusLabel = isExpired ? "Đã nộp bài — Đã hết hạn" : "Đã nộp bài";
        } else {
          statusLabel = isExpired
            ? "Chưa nộp bài — Đã hết hạn"
            : "Chưa nộp bài";
        }

        const rawName = `Bài #${data.id} — ${(
          data.noidung || "Không có nội dung"
        ).slice(0, 50)} — ${statusLabel}`;

        return {
          name: rawName.length > 100 ? rawName.slice(0, 97) + "..." : rawName,
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
