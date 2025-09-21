import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../data");
const PAGE_SIZE = 25;

export const data = new SlashCommandBuilder()
  .setName("xoa")
  .setDescription("Chọn bài tập để xoá từ menu");

export async function execute(interaction) {
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
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

  try {
    await fs.ensureDir(DATA_DIR);
    const files = await fs.readdir(DATA_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      return interaction.reply({
        content: "❌ Không có bài tập nào để xóa.",
        flags: 1 << 6,
      });
    }

    const firstPageFiles = jsonFiles.slice(0, PAGE_SIZE);
    const assignments = await Promise.all(
      firstPageFiles.map(async (file) => {
        const filePath = path.join(DATA_DIR, file);
        try {
          const data = await fs.readJson(filePath);
          return {
            id: data.id,
            noidung: data.noidung || "Không có nội dung",
            author: data.author || "Không xác định",
          };
        } catch {
          return null;
        }
      })
    );

    const validAssignments = assignments.filter(Boolean);

    if (validAssignments.length === 0) {
      return interaction.reply({
        content: "❌ Không có bài tập hợp lệ để xoá.",
        flags: 1 << 6,
      });
    }

    const options = validAssignments
      .filter((a) => typeof a.id === "string" && typeof a.noidung === "string")
      .map((a) => ({
        label: `Bài #${a.id}`,
        description: a.noidung.slice(0, 100),
        value: a.id,
      }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("select_assignments_to_delete")
      .setPlaceholder("Chọn bài tập để xóa")
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("confirm_delete_selected")
        .setLabel("Xác nhận xoá")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("cancel_delete_selected")
        .setLabel("Huỷ")
        .setStyle(ButtonStyle.Secondary)
    );

    const totalPages = Math.ceil(jsonFiles.length / PAGE_SIZE);
    const pageInfo =
      totalPages > 1
        ? `\n\n**Trang 1/${totalPages}** - Chức năng phân trang đang được phát triển.`
        : "";

    const response = await interaction.reply({
      content: `Vui lòng chọn các bài tập bạn muốn xoá:${pageInfo}`,
      components: [new ActionRowBuilder().addComponents(selectMenu), buttons],
      flags: 1 << 6,
    });

    const selectedIds = new Set();
    const collector = response.createMessageComponentCollector({
      time: 120000,
    });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({
          content: "Bạn không có quyền tương tác với menu này.",
          flags: 1 << 6,
        });
      }

      if (i.customId === "select_assignments_to_delete") {
        i.values.forEach((id) => selectedIds.add(id));

        const updatedMenu = StringSelectMenuBuilder.from(
          selectMenu
        ).setPlaceholder(`🟢 Đã chọn ${selectedIds.size} bài tập`);

        await i.update({
          content: `Đã chọn ${selectedIds.size} bài tập. Nhấn "Xác nhận xoá" để tiếp tục.${pageInfo}`,
          components: [
            new ActionRowBuilder().addComponents(updatedMenu),
            buttons,
          ],
        });
      } else if (i.customId === "confirm_delete_selected") {
        if (selectedIds.size === 0) {
          return i.update({
            content: "Bạn chưa chọn bài tập nào để xoá.",
            components: [
              new ActionRowBuilder().addComponents(selectMenu),
              buttons,
            ],
          });
        }

        const confirmButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("final_confirm_delete")
            .setLabel(`Xác nhận xoá ${selectedIds.size} bài tập`)
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("final_cancel_delete")
            .setLabel("Huỷ")
            .setStyle(ButtonStyle.Secondary)
        );

        await i.update({
          content: `Bạn sắp xoá ${selectedIds.size} bài tập. Xác nhận lần cuối?`,
          components: [confirmButtons],
        });
      } else if (i.customId === "final_confirm_delete") {
        await i.update({
          content: `Đang xoá ${selectedIds.size} bài tập...`,
          components: [],
        });

        await deleteSelectedAssignments(interaction, Array.from(selectedIds));
        collector.stop();
      } else if (
        i.customId === "cancel_delete_selected" ||
        i.customId === "final_cancel_delete"
      ) {
        await i.update({
          content: "Đã huỷ thao tác xoá.",
          components: [],
        });
        collector.stop();
      }
    });

    collector.on("end", async (collected) => {
      if (collected.size === 0) {
        await interaction.editReply({
          content: "Hết thời gian tương tác. Đã huỷ thao tác xoá.",
          components: [],
        });
      }
    });
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: `Đã xảy ra lỗi: ${error.message}`,
      flags: 1 << 6,
    });
  }
}

async function deleteSelectedAssignments(interaction, selectedIds) {
  const results = await Promise.all(
    selectedIds.map(async (id) => {
      const filePath = path.join(DATA_DIR, `${id}.json`);
      try {
        if (!(await fs.pathExists(filePath))) {
          return {
            success: false,
            message: `Không tìm thấy bài tập: \`${id}\``,
          };
        }

        await fs.remove(filePath);
        return { success: true, message: `#\`${id}\`` };
      } catch (err) {
        return {
          success: false,
          message: `Lỗi xoá \`${id}\`: ${err.message}`,
        };
      }
    })
  );

  const success = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const report = [
    success.length > 0 ? `## Đã xoá thành công ${success.length} bài tập` : "",
    ...success.map((r) => r.message),
    failed.length > 0 ? `\n## Không thể xoá (${failed.length})` : "",
    ...failed.map((r) => r.message),
  ]
    .filter(Boolean)
    .join("\n");

  await interaction.editReply({
    content: report || "Không có bài nào được xoá.",
    components: [],
  });
}
