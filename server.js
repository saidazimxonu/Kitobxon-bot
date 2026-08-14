// Kitobxon Telegram Bot — foydalanuvchilarni saqlaydi va e'lon yuborish imkonini beradi
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://kitobxonn.netlify.app/';
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');

if (!BOT_TOKEN) {
  console.error('XATO: BOT_TOKEN muhit o\'zgaruvchisi topilmadi. Render sozlamalarida qo\'shing.');
  process.exit(1);
}
if (!ADMIN_SECRET) {
  console.error('XATO: ADMIN_SECRET muhit o\'zgaruvchisi topilmadi. Render sozlamalarida qo\'shing.');
  process.exit(1);
}

// ---------- Foydalanuvchilarni saqlash (oddiy JSON fayl) ----------
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Foydalanuvchilarni o\'qishda xato:', e);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Foydalanuvchilarni saqlashda xato:', e);
  }
}

let users = loadUsers();

// ---------- Bot (polling rejimida) ----------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const isNew = !users[chatId];

  users[chatId] = {
    chatId,
    username: msg.from.username || null,
    firstName: msg.from.first_name || null,
    joinedAt: users[chatId]?.joinedAt || new Date().toISOString(),
  };
  saveUsers(users);

  bot.sendMessage(
    chatId,
    isNew
      ? `Assalomu alaykum, ${msg.from.first_name || 'do\'stim'}! 📖\n\nKitobxon — kunlik o'qish odatingizni shakllantiruvchi ilova. Quyidagi tugma orqali ochib, o'qishni boshlang!`
      : `Yana xush kelibsiz, ${msg.from.first_name || 'do\'stim'}! 📖`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: '📖 Kitobxonni ochish', web_app: { url: MINI_APP_URL } }]],
      },
    }
  );
});

bot.onText(/\/stop/, (msg) => {
  const chatId = msg.chat.id;
  delete users[chatId];
  saveUsers(users);
  bot.sendMessage(chatId, "Obuna bekor qilindi. Xabarlar endi yuborilmaydi. Qaytadan yoqish uchun /start yozing.");
});

// ---------- Admin uchun HTTP API (e'lon yuborish) ----------
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/', (req, res) => {
  res.send(`Kitobxon bot ishlab turibdi. Ro'yxatdagi foydalanuvchilar: ${Object.keys(users).length}`);
});

// E'lon yuborish: POST /broadcast  { "secret": "...", "message": "..." }
app.post('/broadcast', async (req, res) => {
  const { secret, message } = req.body || {};
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: '"message" maydoni kerak' });
  }

  const chatIds = Object.keys(users);
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      await bot.sendMessage(chatId, message, {
        reply_markup: {
          inline_keyboard: [[{ text: '📖 Kitobxonni ochish', web_app: { url: MINI_APP_URL } }]],
        },
      });
      sent++;
    } catch (e) {
      failed++;
      // Agar foydalanuvchi botni bloklagan bo'lsa, ro'yxatdan o'chiramiz
      if (e.response && (e.response.statusCode === 403)) {
        delete users[chatId];
      }
    }
    // Telegram tezlik cheklovidan qochish uchun kichik pauza
    await new Promise((r) => setTimeout(r, 40));
  }
  saveUsers(users);

  res.json({ total: chatIds.length, sent, failed });
});

app.listen(PORT, () => {
  console.log(`Kitobxon bot serveri ${PORT}-portda ishga tushdi.`);
});
