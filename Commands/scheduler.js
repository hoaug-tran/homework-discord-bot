import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });
const CHANNEL_ID = process.env.ALLOW_CHANNEL_ID;
const FIXED_ROLE_ID = process.env.FIXED_ROLE_ID;
const GUILD_ID = process.env.GUILD_ID;

const DATA_DIR = path.join(__dirname, "../Data");
const REMINDER_PATH = path.join(DATA_DIR, "reminders.json");

function isInWindow(currentMs, targetMs, windowMs, margin = 60_000) {
  return (
    currentMs <= targetMs - (windowMs - margin) &&
    currentMs >= targetMs - (windowMs + margin)
  );
}

let lastStudentCount = -1;

export async function initReminderScheduler(client) {
  setInterval(async () => {
    const now = new Date();
    const nowMs = now.getTime();

    const files = (await fs.readdir(DATA_DIR)).filter(
      (f) => f.startsWith("bt_") && f.endsWith(".json")
    );
    const reminders = await fs.readJson(REMINDER_PATH).catch(() => ({}));

    const guild = await client.guilds.fetch(GUILD_ID);
    const role = await guild.roles.fetch(FIXED_ROLE_ID).catch(() => null);
    const allMembers = await guild.members.fetch();

    if (!role) {
      console.log("Không tìm thấy role.");
      return;
    }

    const allStudents = allMembers
      .filter((m) => m.roles.cache.has(FIXED_ROLE_ID))
      .map((m) => m.id);
    if (allStudents.length !== lastStudentCount) {
      lastStudentCount = allStudents.length;
      console.log(
        `Đã lấy ${allStudents.length} thành viên trong role ${role.name}`
      );
    }

    for (const file of files) {
      const bt = await fs.readJson(path.join(DATA_DIR, file));
      const deadlineMs = new Date(bt.deadline).getTime();
      const baiId = bt.id;

      if (nowMs > deadlineMs) continue;

      const remind2h = isInWindow(nowMs, deadlineMs, 2 * 60 * 60 * 1000);
      const remind10m = isInWindow(nowMs, deadlineMs, 10 * 60 * 1000);
      if (!remind2h && !remind10m) continue;

      reminders[baiId] ??= {};
      const submissions = bt.submissions || {};

      for (const userId of allStudents) {
        const sub = submissions[userId];
        const remindState = reminders[baiId][userId] ?? {
          "2h": false,
          "10m": false,
        };

        const passed = Array.isArray(sub?.files)
          ? sub.files.some((s) => s.passed)
          : sub?.passed === true;

        if (!bt.hasTestCase && sub) continue;
        if (bt.hasTestCase && passed) continue;

        const channel = await client.channels
          .fetch(CHANNEL_ID)
          .catch(() => null);
        if (!channel?.isTextBased()) continue;

        let timeNote = "";
        if (remind2h && !remindState["2h"]) timeNote = "2 tiếng nữa thôi";
        else if (remind10m && !remindState["10m"])
          timeNote = "10 phút nữa thôi";
        else continue;

        let content = "";
        if (!sub) {
          content = `**[Nhắc nhở]** <@${userId}>. Bạn chưa nộp bài **#${baiId}**. Thời gian nộp chỉ còn ${timeNote}.`;
        } else {
          content = `**[Nhắc nhở]** <@${userId}>. Bài **#${baiId}** bạn đã nộp nhưng chưa đúng, hãy nộp lại bài nhé. Thời gian nộp chỉ còn ${timeNote}.`;
        }

        await channel
          .send({
            content,
            allowedMentions: { users: [userId] },
          })
          .catch(() => {});

        if (remind2h) {
          remindState["2h"] = true;
          console.log(`[2h] Nhắc <@${userId}> về bài #${baiId}`);
        }
        if (remind10m) {
          remindState["10m"] = true;
          console.log(`[10m] Nhắc <@${userId}> về bài #${baiId}`);
        }

        reminders[baiId][userId] = remindState;
      }
    }

    await fs.writeJson(REMINDER_PATH, reminders, { spaces: 2 });
  }, 60 * 1000);
}
