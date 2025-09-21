import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

export const data = new SlashCommandBuilder()
  .setName("random")
  .setDescription("Random số hoặc từ danh sách/người")
  .addStringOption((option) =>
    option
      .setName("tieu_de")
      .setDescription("Tiêu đề random (chỉ áp dụng cho random danh_sach)")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("dieu_kien")
      .setDescription("Random 1 số trong khoảng cụ thể (ví dụ: 1 100)")
      .setRequired(false)
  )
  .addIntegerOption((option) =>
    option
      .setName("han")
      .setDescription("Số giây đếm ngược trước khi công bố kết quả")
      .setMinValue(1)
      .setMaxValue(60)
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("danh_sach")
      .setDescription(
        "Danh sách tên hoặc gì đó ... , cách nhau bởi dấu phẩy (,)"
      )
      .setRequired(false)
  );

export async function execute(interaction) {
  const dk = interaction.options.getString("dieu_kien");
  const han = interaction.options.getInteger("han") ?? 0;
  const danhSachRaw = interaction.options.getString("danh_sach");
  const tieuDe = interaction.options.getString("tieu_de");
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  const FIXED_ROLE_ID = process.env.FIXED_ROLE_ID;
  const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE_ID);

  let mode,
    candidates = [];

  // Random số
  if (dk) {
    const parts = dk.trim().split(/\s+/).map(Number);
    if (parts.length === 2 && !parts.some(isNaN) && parts[0] <= parts[1]) {
      for (let i = parts[0]; i <= parts[1]; i++) candidates.push(i);
      mode = "number";
    } else {
      return interaction.reply({
        content: "❌ Cú pháp `dieu_kien` không hợp lệ. Dùng: `1 100`",
        flags: 1 << 6,
      });
    }
  }
  // Random danh sách nhập tay
  else if (danhSachRaw) {
    candidates = danhSachRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!candidates.length) {
      return interaction.reply({
        content: "❌ Danh sách không hợp lệ.",
        flags: 1 << 6,
      });
    }
    mode = "list";
  }
  // Random người trong role cố định (admin-only)
  else if (isAdmin && FIXED_ROLE_ID) {
    const allMembers = await interaction.guild.members.fetch();
    const members = allMembers.filter(
      (m) => m.roles.cache.has(FIXED_ROLE_ID) && !m.user.bot
    );
    if (members.size > 0) {
      candidates = members.map((m) => m.displayName);
      mode = "role";
    } else {
      return interaction.reply({
        content:
          "❌ Không tìm thấy thành viên nào hợp lệ trong role để random.",
        flags: 1 << 6,
      });
    }
  } else {
    return interaction.reply({
      content:
        "❌ Hãy nhập `dieu_kien` hoặc `danh_sach`, hoặc bạn cần quyền admin để random role.",
      flags: 1 << 6,
    });
  }

  // Animation quay số
  let targetDesc = "";
  if (
    (mode === "list" || mode === "role") &&
    tieuDe &&
    tieuDe.trim().length > 0
  ) {
    targetDesc = `**${tieuDe}**\n\n`;
  }

  let desc =
    han > 0
      ? `${targetDesc}Đếm ngược \`${han}\` giây...\nQuay số ngẫu nhiên đang diễn ra...`
      : `${targetDesc}Đang xử lý kết quả...`;

  const loadingEmbed = new EmbedBuilder()
    .setTitle("ĐANG QUAY RANDOM...")
    .setDescription(desc)
    .setColor(0xf1c40f)
    .setTimestamp();
  await interaction.reply({ embeds: [loadingEmbed] });

  if (han > 0) {
    for (let i = 0; i < han; i++) {
      const temp = candidates[Math.floor(Math.random() * candidates.length)];
      const rollingDesc =
        `${targetDesc}` +
        `Đếm ngược \`${han - i}\` giây...\n` +
        `🎲 Đang quay random: **${temp}**`;
      const rollingEmbed =
        EmbedBuilder.from(loadingEmbed).setDescription(rollingDesc);
      await interaction.editReply({ embeds: [rollingEmbed] });
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const result = candidates[Math.floor(Math.random() * candidates.length)];

  // Kết quả
  let resultEmbed;
  if (mode === "number") {
    resultEmbed = new EmbedBuilder()
      .setTitle("KẾT QUẢ RANDOM SỐ")
      .setDescription(`Con số may mắn đó là: \`${result}\`\u2003🎉`)
      .setColor(0x3498db)
      .setTimestamp();
  } else {
    resultEmbed = new EmbedBuilder()
      .setTitle(tieuDe && tieuDe.trim().length > 0 ? tieuDe : "KẾT QUẢ RANDOM")
      .setDescription(
        `Người may mắn đó là **${result}**.\n Xin chúc mừng bạn !\u2003🎉`
      )
      .setColor(0x2ecc71)
      .setTimestamp();
  }
  return interaction.editReply({ embeds: [resultEmbed] });
}
