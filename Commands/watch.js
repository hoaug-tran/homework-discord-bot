import {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from "discord.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../Data");

export const data = new SlashCommandBuilder()
  .setName("xem")
  .setDescription("Xem bài tập theo ID hoặc danh sách chưa làm")
  .addStringOption((option) =>
    option
      .setName("id")
      .setDescription("ID bài tập muốn xem")
      .setRequired(false)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  const files = await fs.readdir(DATA_DIR);
  const jsonFiles = files.filter(
    (f) => f.startsWith("bt_") && f.endsWith(".json")
  );
  const filtered = jsonFiles.filter((f) => f.includes(focused)).slice(0, 25);

  const choices = [];
  for (const file of filtered) {
    const id = file.replace(".json", "");
    try {
      const bt = await fs.readJson(path.join(DATA_DIR, file));
      const title =
        bt.noidung?.toString().replace(/\s+/g, " ").trim() ||
        "Không rõ nội dung";
      choices.push({ name: `Bài #${id} - ${title.slice(0, 80)}`, value: id });
    } catch {
      choices.push({ name: `#${id}`, value: id });
    }
  }

  await interaction.respond(choices);
}

export async function execute(interaction) {
  const ALLOW_CHANNEL_ID = process.env.ALLOW_CHANNEL_ID;
  const FIXED_ROLE_ID = process.env.FIXED_ROLE_ID;

  if (interaction.channelId !== ALLOW_CHANNEL_ID) {
    return interaction.reply({
      content:
        "🚫 Lệnh này chỉ được sử dụng tại kênh <#" + ALLOW_CHANNEL_ID + ">.",
      flags: 1 << 6,
    });
  }

  const id = interaction.options.getString("id");
  const files = await fs.readdir(DATA_DIR);
  const jsonFiles = files.filter(
    (f) => f.startsWith("bt_") && f.endsWith(".json")
  );

  if (jsonFiles.length === 0) {
    return interaction.reply({
      content: "❌ Hiện không có bài tập nào.",
      flags: 1 << 6,
    });
  }

  const userId = interaction.user.id;
  const unfinished = [];

  for (const file of jsonFiles) {
    const bt = await fs.readJson(path.join(DATA_DIR, file));
    const deadline = new Date(bt.deadline);
    const now = new Date();
    const sub = bt.submissions?.[userId];

    const isAllowed =
      !Array.isArray(bt.allowedRoles) ||
      bt.allowedRoles.length === 0 ||
      bt.allowedRoles.some((roleId) =>
        interaction.member.roles.cache.has(roleId)
      ) ||
      bt.author === userId;

    if (isAllowed && deadline > now && !sub) {
      unfinished.push(bt);
    }
  }

  if (id) {
    const fileToRead = jsonFiles.find((f) => f.startsWith(id));
    if (!fileToRead) {
      return interaction.reply({
        content: "❌ Không tìm thấy bài tập với ID đó.",
        flags: 1 << 6,
      });
    }

    const filePath = path.join(DATA_DIR, fileToRead);
    const bt = await fs.readJson(filePath);
    const userId = interaction.user.id;
    const member = await interaction.guild.members.fetch(userId);
    const memberRoles = [...member.roles.cache.keys()];

    const isAllowed =
      interaction.member.roles.cache.has(FIXED_ROLE_ID) || bt.author === userId;

    if (!isAllowed) {
      return interaction.reply({
        content: "🚫 Bạn không có quyền xem bài tập này.",
        flags: 1 << 6,
      });
    }

    return replyWithEmbed(interaction, bt, userId, id);
  }

  if (unfinished.length === 0) {
    return interaction.reply({
      content: "💤 Hiện tại bạn không có bài tập nào cần làm.",
      flags: 1 << 6,
    });
  }

  if (unfinished.length === 1) {
    return replyWithEmbed(interaction, unfinished[0], userId);
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("chon_bai_xem")
    .setPlaceholder("Chọn một bài tập chưa làm")
    .addOptions(
      unfinished.slice(0, 25).map((bt) => ({
        label: `${bt.noidung.slice(0, 40)} - #${bt.id}`,
        value: bt.id,
        description: `Hạn nộp: ${new Date(bt.deadline).toLocaleString(
          "vi-VN"
        )}`,
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);

  const noticeEmbed = new EmbedBuilder()
    .setTitle(`BẠN CÓ ${unfinished.length} BÀI TẬP CHƯA LÀM`)
    .setDescription("Nhớ để ý thời gian và nộp bài đúng hạn nhé!")
    .setColor(0x3498db)
    .setFooter({ text: "Chọn một bài tập bên dưới để xem chi tiết" });

  await interaction.reply({
    embeds: [noticeEmbed],
    components: [row],
    flags: 1 << 6,
  });

  const collector = interaction.channel.createMessageComponentCollector({
    filter: (i) => i.user.id === userId && i.customId === "chon_bai_xem",
    time: 30_000,
  });

  collector.on("collect", async (i) => {
    const selectedId = i.values[0];
    const bt = unfinished.find((b) => b.id === selectedId);

    if (!bt) {
      return i.reply({
        content: "❌ Bài tập không tồn tại.",
        flags: 1 << 6,
      });
    }

    const embed = createEmbedFromBt(bt, userId, selectedId);

    if (!i.replied && !i.deferred) {
      await i.update({
        content: "",
        embeds: [embed],
        components: [],
        flags: 1 << 6,
      });
    }

    collector.stop();
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      try {
        await interaction.editReply({
          content: "❌ Hết thời gian chọn bài. Vui lòng dùng lệnh /xem lại.",
          components: [],
        });
      } catch (err) {}
    }
  });
}

function createEmbedFromBt(bt, userId, idOverride = null) {
  const deadline = new Date(bt.deadline);
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

  const sub = bt.submissions?.[userId];
  let submissionStatus = "";
  let embedColor;

  if (sub) {
    if (bt.testcase) {
      submissionStatus = sub.passed
        ? "Bạn đã nộp bài và đã đúng toàn bộ test case."
        : "Bạn đã nộp bài nhưng bài chưa đúng. Bạn có thể nộp lại.";
      embedColor = sub.passed ? 0x2ecc71 : 0xe67e22;
    } else {
      submissionStatus = "Bạn đã nộp bài rồi (không có test case)";
      embedColor = 0x2ecc71;
    }
  } else {
    submissionStatus =
      timeLeftMs > 0
        ? "🔴 **Chưa nộp bài.**"
        : "❌ **Đã quá hạn và chưa nộp.**";
    embedColor = timeLeftMs > 0 ? 0xe67e22 : 0xff4444;
  }

  const embed = new EmbedBuilder()
    .setTitle(idOverride ? `BÀI TẬP #${idOverride}` : `BÀI TẬP #${bt.id}`)
    .setDescription(`> ${bt.noidung.replace(/\n/g, "\n> ")}`)
    .setColor(embedColor)
    .addFields(
      {
        name: "Thời gian",
        value: `Hạn nộp bài: \`${deadlineFormatted}\`\nThời gian còn lại: \`${relativeDeadline}\`\nSố lần nộp: \`${
          sub?.files?.length || 0
        } lần\``,
        inline: false,
      },
      { name: "Người tạo", value: `<@${bt.author}>`, inline: true },
      { name: "Trạng thái bài tập", value: submissionStatus }
    )
    .setFooter({ text: `ID: ${bt.id}` })
    .setTimestamp(bt.createdAt || now);

  if (bt.imgUrl) embed.setImage(bt.imgUrl);
  if (bt.fileUrl)
    embed.addFields({
      name: "File đính kèm",
      value: `[Tải xuống](${bt.fileUrl})`,
      inline: false,
    });

  return embed;
}

async function replyWithEmbed(interaction, bt, userId, idOverride = null) {
  const embed = createEmbedFromBt(bt, userId, idOverride);
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ embeds: [embed], flags: 1 << 6 });
  } else {
    return interaction.reply({ embeds: [embed], flags: 1 << 6 });
  }
}
