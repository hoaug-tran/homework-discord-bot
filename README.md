# Discord Homework Bot

Bot Discord giúp quản lý bài tập, nộp bài, và chấm test case tự động.  
Có thể tích hợp Google Drive để lưu trữ file an toàn.

---

## 🚀 Cài đặt

### 1. Tạo project Node.js

- Nếu bạn chưa có project Node:

```bash
mkdir discord-homework-bot
cd discord-homework-bot
npm init -y
```

### 2. Clone project

```bash
git clone https://github.com/hoaug-tran/homework-discord-bot.git
```

### 3. Cài dependencies

```bash
npm install
```

### 4. Tạo file .env

```bash
node core/initEnv.js
```

- Bạn sẽ được hỏi để nhập các thông tin:

```
BOT_TOKEN=       # Discord Bot Token
CLIENT_ID=       # Discord Application Client ID
GUILD_ID=        # Discord Server ID
ADMIN_ROLE_ID=   # Role ID của Teacher
FIXED_ROLE_ID=   # Role ID của Student
ALLOW_CHANNEL_ID=# Channel ID cho phép dùng lệnh
GGDRIVE_CLIENT_ID= # (nếu có)
GGDRIVE_SECRET_ID= # (nếu có)
```

### 5. Chạy BOT

```bash
node core/bot.js
```

### 6. Kết nối Google Drive (tùy chọn)

1. Vào Google Cloud Console
2. Tạo một project mới.
3. Bật Google Drive API.
4. Vào APIs & Services → Credentials → Create Credentials → OAuth Client ID.
5. Chọn loại Web application.
6. Thêm Authorized redirect URI:

```bash
http://localhost:3000/auth/google/callback
```

7. Copy Client ID và Client Secret → dán vào .env:

```bash
GGDRIVE_CLIENT_ID=your_client_id
GGDRIVE_SECRET_ID=your_secret
```

8. Chạy server auth.js

```bash
node integrations/google-drive/auth.js
```

9. Mở trình duyệt

```bash
http://localhost:3000/auth/google
```

10. Đăng nhập Google → bot sẽ lưu token trong token.json.

### Cấu trúc thư mục:

```bash
project-root/
 ├── core/               # bot.js, sync.js, initEnv.js
 ├── commands/           # slash commands (/nop, ...)
 ├── jobs/               # cron jobs, checkJava, uploadExpired
 ├── data/               # reminders.json, bt_xxx.json
 ├── submissions/        # bài nộp
 ├── integrations/       # google-drive/
 └── .env
```
