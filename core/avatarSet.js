import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, "avatar.cache.json");
const AVATAR_FILE = path.join(__dirname, "avatar.gif");

export async function setBotAvatarIfNeeded(client) {
  try {
    const gifBuffer = await fs.readFile(AVATAR_FILE);
    const currentAvatarId = client.user.avatar;

    let lastSetId = null;
    try {
      const cache = await fs.readJson(CACHE_FILE);
      lastSetId = cache.lastSetId;
    } catch {}

    if (currentAvatarId && currentAvatarId === lastSetId) {
      console.log("Avatar đã được đặt trước đó, bỏ qua.");
      return;
    }

    await client.user.setAvatar(gifBuffer);
    console.log("Đã cập nhật avatar bot!");

    await fs.writeJson(
      CACHE_FILE,
      { lastSetId: client.user.avatar },
      { spaces: 2 }
    );
  } catch (err) {
    console.error("❌ Lỗi khi đặt avatar:", err);
  }
}
