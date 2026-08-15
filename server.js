// Kitobxon Telegram Bot — foydalanuvchilarni saqlaydi va e'lon yuborish imkonini beradi
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://kitobxonn.netlify.app/';
const PORT = process.env.PORT || 3000;
const REMINDER_HOUR = parseInt(process.env.REMINDER_HOUR || '20', 10); // 24 soatlik format, Toshkent vaqti
const REMINDER_ENABLED = process.env.REMINDER_ENABLED !== 'false';
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || null;
const TIMEZONE = 'Asia/Tashkent';
const USERS_FILE = path.join(__dirname, 'users.json');
const REMINDER_FILE = path.join(__dirname, 'reminder.json');
const CHECKINS_FILE = path.join(__dirname, 'checkins.json');

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

// ---------- Eslatma matnini saqlash ----------
const DEFAULT_REMINDER = "Salom! Bugun hali kitob o'qimadingiz shekilli 📖 Bir necha bet o'qib, streak'ingizni saqlab qoling!";

function loadReminderText() {
  try {
    if (fs.existsSync(REMINDER_FILE)) {
      return JSON.parse(fs.readFileSync(REMINDER_FILE, 'utf8')).text;
    }
  } catch (e) {
    console.error('Eslatma matnini o\'qishda xato:', e);
  }
  return DEFAULT_REMINDER;
}

function saveReminderText(text) {
  try {
    fs.writeFileSync(REMINDER_FILE, JSON.stringify({ text }, null, 2));
  } catch (e) {
    console.error('Eslatma matnini saqlashda xato:', e);
  }
}

let reminderText = loadReminderText();

// ---------- Kim bugun o'qidi (check-in) ----------
function loadCheckins() {
  try {
    if (fs.existsSync(CHECKINS_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKINS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Check-in ma\'lumotlarini o\'qishda xato:', e);
  }
  return {};
}

function saveCheckins(checkins) {
  try {
    fs.writeFileSync(CHECKINS_FILE, JSON.stringify(checkins, null, 2));
  } catch (e) {
    console.error('Check-in ma\'lumotlarini saqlashda xato:', e);
  }
}

let checkins = loadCheckins(); // { chatId: 'YYYY-MM-DD' — oxirgi o'qigan sana }

function todayInTashkent() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TIMEZONE }); // YYYY-MM-DD
}

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

// ---------- Fikr-mulohaza: buyruq bo'lmagan har qanday xabarni adminga uzatish ----------
bot.on('message', (msg) => {
  const text = msg.text;
  if (!text || text.startsWith('/')) return; // buyruqlarni bu yerda ishlamaymiz (yuqorida alohida ishlanadi)

  const chatId = msg.chat.id;

  // Foydalanuvchiga tasdiq
  bot.sendMessage(chatId, "Rahmat! Fikringiz yetkazildi 🙏");

  // Adminga uzatish
  if (ADMIN_CHAT_ID) {
    const from = msg.from;
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
    const usernamePart = from.username ? ` (@${from.username})` : '';
    bot.sendMessage(
      ADMIN_CHAT_ID,
      `📩 Yangi fikr/xabar\n👤 ${fullName}${usernamePart}\n🆔 chatId: ${chatId}\n\n${text}`
    ).catch((e) => console.error('Adminga yuborishda xato:', e.message));
  } else {
    console.log('ADMIN_CHAT_ID sozlanmagan — fikr faqat logga yozildi:', chatId, text);
  }
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

// Ro'yxatdagi foydalanuvchilarni olish: GET /users?secret=...
app.get('/users', (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  const list = Object.values(users).map(u => ({
    chatId: u.chatId,
    username: u.username,
    firstName: u.firstName,
    joinedAt: u.joinedAt,
  }));
  res.json({ users: list });
});

// Bitta foydalanuvchiga xabar: POST /send  { "secret": "...", "chatId": "...", "message": "..." }
app.post('/send', async (req, res) => {
  const { secret, chatId, message } = req.body || {};
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  if (!chatId || !message) {
    return res.status(400).json({ error: '"chatId" va "message" maydonlari kerak' });
  }
  try {
    await bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [[{ text: '📖 Kitobxonni ochish', web_app: { url: MINI_APP_URL } }]],
      },
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Yuborishda xato' });
  }
});

// Ilova tomonidan chaqiriladi: foydalanuvchi bugungi maqsadga yetganda
// POST /checkin  { "chatId": "..." }  — maxfiy kalit talab qilinmaydi (foydalanuvchining o'zi haqida signal)
app.post('/checkin', (req, res) => {
  const { chatId } = req.body || {};
  if (!chatId) {
    return res.status(400).json({ error: '"chatId" maydoni kerak' });
  }
  checkins[String(chatId)] = todayInTashkent();
  saveCheckins(checkins);
  res.json({ ok: true });
});

// Eslatma matnini ko'rish/o'zgartirish: GET/POST /reminder-settings
app.get('/reminder-settings', (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  res.json({ text: reminderText, hour: REMINDER_HOUR, enabled: REMINDER_ENABLED, timezone: TIMEZONE });
});

app.post('/reminder-settings', (req, res) => {
  const { secret, text } = req.body || {};
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: '"text" maydoni kerak' });
  }
  reminderText = text;
  saveReminderText(text);
  res.json({ ok: true, text: reminderText });
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
      if (e.response && (e.response.statusCode === 403)) {
        delete users[chatId];
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  saveUsers(users);

  res.json({ total: chatIds.length, sent, failed });
});

// ---------- Kunlik eslatma yuborish logikasi (cron va qo'lda test uchun umumiy) ----------
async function runDailyReminder(){
  const today = todayInTashkent();
  const targets = Object.keys(users).filter((chatId) => checkins[chatId] !== today);
  console.log(`[Eslatma] ${targets.length} ta foydalanuvchiga yuborilmoqda...`);
  let sent = 0;
  let failed = 0;
  for (const chatId of targets) {
    try {
      await bot.sendMessage(chatId, reminderText, {
        reply_markup: {
          inline_keyboard: [[{ text: '📖 Kitobxonni ochish', web_app: { url: MINI_APP_URL } }]],
        },
      });
      sent++;
    } catch (e) {
      failed++;
      if (e.response && e.response.statusCode === 403) {
        delete users[chatId];
      }
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  saveUsers(users);
  return { totalUsers: Object.keys(users).length, targeted: targets.length, sent, failed };
}

// Sinov uchun: eslatmani hoziroq, vaqtni kutmasdan ishga tushirish
// POST /trigger-reminder  { "secret": "..." }
app.post('/trigger-reminder', async (req, res) => {
  const { secret } = req.body || {};
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  const result = await runDailyReminder();
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`Kitobxon bot serveri ${PORT}-portda ishga tushdi.`);
});

// ---------- Avtomatik kunlik eslatma ----------
// Har kuni REMINDER_HOUR'da (Toshkent vaqti) ishga tushadi va faqat
// o'sha kuni hali check-in qilmagan (o'qimagan) foydalanuvchilarga yuboradi.
if (REMINDER_ENABLED) {
  const cronExpr = `0 ${REMINDER_HOUR} * * *`;
  cron.schedule(cronExpr, runDailyReminder, { timezone: TIMEZONE });
  console.log(`Avtomatik eslatma yoqilgan: har kuni soat ${REMINDER_HOUR}:00 (${TIMEZONE})`);
} else {
  console.log('Avtomatik eslatma o\'chirilgan (REMINDER_ENABLED=false).');
}
