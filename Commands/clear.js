import { SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

export const data = new SlashCommandBuilder()
  .setName("dondep")
  .setDescription("Xóa một số lượng tin nhắn trong kênh")
  .addIntegerOption((option) =>
    option
      .setName("so_luong")
      .setDescription("Số lượng tin nhắn muốn xóa (tối đa 100)")
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
  );

export async function execute(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);

  if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
    return interaction.reply({
      content: "🚫 Bạn không có quyền sử dụng lệnh này.",
      flags: 1 << 6,
    });
  }

  const amount = interaction.options.getInteger("so_luong");

  try {
    const deleted = await interaction.channel.bulkDelete(amount, true);

    return interaction.reply({
      content: `Đã xóa \`${deleted.size}\` tin nhắn trong kênh.`,
      flags: 1 << 6,
    });
  } catch (err) {
    console.error("Lỗi khi xóa tin nhắn:", err);
    return interaction.reply({
      content:
        "❌ Không thể xóa tin nhắn. Có thể do tin nhắn quá cũ (>14 ngày).",
      flags: 1 << 6,
    });
  }
}
