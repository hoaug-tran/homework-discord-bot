import express from "express";
import { getAuthUrl, getAccessToken } from "./auth.js";
import fs from "fs";

const app = express();
const PORT = 3000;

app.get("/auth/google", (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const auth = await getAccessToken(code);

  fs.writeFileSync("token.json", JSON.stringify(auth.credentials));
  res.send("Đã lưu access_token thành công!");
});

app.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
