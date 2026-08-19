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
const ADMIN_CHAT_ID = (process.env.ADMIN_CHAT_ID || '').trim() || null;
const TIMEZONE = 'Asia/Tashkent';
const USERS_FILE = path.join(__dirname, 'users.json');
const REMINDER_FILE = path.join(__dirname, 'reminder.json');
const CHECKINS_FILE = path.join(__dirname, 'checkins.json');
const POLLS_FILE = path.join(__dirname, 'polls.json');
const POLL_INDEX_FILE = path.join(__dirname, 'poll_index.json'); // telegramPollId -> campaignId

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

// ---------- So'rovnoma natijalarini saqlash ----------
function loadJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`${file} o'qishda xato:`, e);
  }
  return fallback;
}
function saveJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`${file} saqlashda xato:`, e);
  }
}

let polls = loadJson(POLLS_FILE, {});       // { campaignId: { question, options, createdAt, sentTo: [chatId], answers: { chatId: [optionIndex,...] } } }
let pollIndex = loadJson(POLL_INDEX_FILE, {}); // { telegramPollId: campaignId }

function saveAll() {
  saveJson(POLLS_FILE, polls);
  saveJson(POLL_INDEX_FILE, pollIndex);
}

// ---------- Bot (polling rejimida) ----------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (err) => console.error('Polling xatosi:', err.message));

// Foydalanuvchi so'rovnomaga ovoz berganda (faqat is_anonymous:false so'rovnomalar uchun keladi)
bot.on('poll_answer', (pa) => {
  const campaignId = pollIndex[pa.poll_id];
  if (!campaignId || !polls[campaignId]) return;
  polls[campaignId].answers[String(pa.user.id)] = {
    optionIds: pa.option_ids,
    name: [pa.user.first_name, pa.user.last_name].filter(Boolean).join(' '),
    username: pa.user.username || null,
    answeredAt: new Date().toISOString(),
  };
  saveAll();
});

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
// va admin javob (reply) yozsa, uni tegishli foydalanuvchiga qaytarish
bot.on('message', (msg) => {
  const text = msg.text;
  if (!text || text.startsWith('/')) return; // buyruqlarni bu yerda ishlamaymiz (yuqorida alohida ishlanadi)

  const chatId = msg.chat.id;
  const isFromAdmin = ADMIN_CHAT_ID && String(chatId) === String(ADMIN_CHAT_ID);

  // Holat 1: Admin, forward qilingan fikr xabariga "Reply" qilib javob yozdi
  if (isFromAdmin && msg.reply_to_message && msg.reply_to_message.text) {
    const match = msg.reply_to_message.text.match(/chatId:\s*(-?\d+)/);
    if (match) {
      const targetChatId = match[1];
      bot.sendMessage(targetChatId, `💬 Admin javobi:\n\n${text}`)
        .then(() => bot.sendMessage(ADMIN_CHAT_ID, '✅ Javobingiz yuborildi.'))
        .catch((e) => bot.sendMessage(ADMIN_CHAT_ID, '❌ Yuborishda xato: ' + e.message));
      return;
    }
  }

  // Holat 2: Adminning o'z sinov xabarlari — fikr sifatida hisoblanmaydi
  if (isFromAdmin) return;

  // Holat 3: Oddiy foydalanuvchidan kelgan fikr — adminga uzatiladi
  bot.sendMessage(chatId, "Rahmat! Fikringiz yetkazildi 🙏");

  if (ADMIN_CHAT_ID) {
    const from = msg.from;
    const fullName = [from.first_name, from.last_name].filter(Boolean).join(' ');
    const usernamePart = from.username ? ` (@${from.username})` : '';
    bot.sendMessage(
      ADMIN_CHAT_ID,
      `📩 Yangi fikr/xabar\n👤 ${fullName}${usernamePart}\n🆔 chatId: ${chatId}\n\n${text}\n\n↩️ Javob berish uchun shu xabarga "Reply" qiling.`
    ).catch((e) => console.error('❌ Adminga yuborishda xato (ADMIN_CHAT_ID:', ADMIN_CHAT_ID, '):', e.message));
  } else {
    console.log('ADMIN_CHAT_ID sozlanmagan — fikr faqat logga yozildi:', chatId, text);
  }
});

// ---------- Admin uchun HTTP API (e'lon yuborish) ----------
const app = express();
app.use(express.json({ limit: '20mb' }));
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

// ---------- Turli xabar turlarini yuborish (matn / rasm / video / so'rovnoma) ----------
// payload.type: 'text' | 'photo' | 'video' | 'poll'
// text: { message }
// photo/video: { caption, mediaUrl } yoki { caption, fileData(base64) }
// poll: { question, options: [...] }
async function sendContent(chatId, payload) {
  const kb = {
    reply_markup: {
      inline_keyboard: [[{ text: '📖 Kitobxonni ochish', web_app: { url: MINI_APP_URL } }]],
    },
  };
  const type = payload.type || 'text';

  if (type === 'photo' || type === 'video') {
    const source = payload.fileData ? Buffer.from(payload.fileData, 'base64') : payload.mediaUrl;
    if (!source) throw new Error('Rasm/video manbasi topilmadi (fayl yoki URL kerak)');
    const opts = { caption: payload.caption || '', ...kb };
    return type === 'photo' ? bot.sendPhoto(chatId, source, opts) : bot.sendVideo(chatId, source, opts);
  }

  if (type === 'poll') {
    const options = (payload.options || []).map((o) => String(o).trim()).filter(Boolean);
    if (!payload.question || options.length < 2) {
      throw new Error('So\'rovnoma uchun savol va kamida 2 ta variant kerak');
    }
    const campaignId = payload.campaignId;
    const sentMsg = await bot.sendPoll(chatId, payload.question, options, { is_anonymous: false });
    if (campaignId && sentMsg.poll) {
      pollIndex[sentMsg.poll.id] = campaignId;
      if (polls[campaignId]) {
        polls[campaignId].sentTo.push(String(chatId));
      }
      saveAll();
    }
    return sentMsg;
  }

  // default: text
  if (!payload.message) throw new Error('"message" maydoni kerak');
  return bot.sendMessage(chatId, payload.message, kb);
}

// So'rovnoma bo'lsa, kampaniya yozuvini oldindan yaratib qo'yish
function preparePollCampaign(payload) {
  if (payload.type !== 'poll') return payload;
  const campaignId = 'poll_' + Date.now();
  polls[campaignId] = {
    question: payload.question,
    options: payload.options,
    createdAt: new Date().toISOString(),
    sentTo: [],
    answers: {},
  };
  saveAll();
  return { ...payload, campaignId };
}

// Bitta foydalanuvchiga xabar: POST /send  { "secret": "...", "chatId": "...", ...payload }
app.post('/send', async (req, res) => {
  const { secret, chatId, ...rawPayload } = req.body || {};
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  if (!chatId) {
    return res.status(400).json({ error: '"chatId" maydoni kerak' });
  }
  try {
    const payload = preparePollCampaign(rawPayload);
    await sendContent(chatId, payload);
    res.json({ ok: true, campaignId: payload.campaignId || null });
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

// E'lon yuborish: POST /broadcast  { "secret": "...", ...payload }
app.post('/broadcast', async (req, res) => {
  const { secret, ...rawPayload } = req.body || {};
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }

  const payload = preparePollCampaign(rawPayload);
  const chatIds = Object.keys(users);
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    try {
      await sendContent(chatId, payload);
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

  res.json({ total: chatIds.length, sent, failed, campaignId: payload.campaignId || null });
});

// So'rovnomalar ro'yxati: GET /polls?secret=...
app.get('/polls', (req, res) => {
  const { secret } = req.query;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  const list = Object.entries(polls)
    .map(([id, p]) => ({ id, question: p.question, createdAt: p.createdAt, sentCount: p.sentTo.length, answeredCount: Object.keys(p.answers).length }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ polls: list });
});

// Bitta so'rovnoma natijasi: GET /poll-results?secret=...&campaignId=...
app.get('/poll-results', (req, res) => {
  const { secret, campaignId } = req.query;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Ruxsat yo\'q — secret noto\'g\'ri' });
  }
  const p = polls[campaignId];
  if (!p) {
    return res.status(404).json({ error: 'Bunday so\'rovnoma topilmadi' });
  }
  const tally = p.options.map(() => 0);
  const voters = [];
  for (const [userId, ans] of Object.entries(p.answers)) {
    ans.optionIds.forEach((i) => { if (tally[i] !== undefined) tally[i]++; });
    voters.push({ userId, name: ans.name, username: ans.username, optionIds: ans.optionIds });
  }
  res.json({
    question: p.question,
    options: p.options,
    tally,
    sentCount: p.sentTo.length,
    answeredCount: voters.length,
    voters,
  });
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
  console.log(ADMIN_CHAT_ID ? `ADMIN_CHAT_ID sozlangan: ${ADMIN_CHAT_ID}` : 'DIQQAT: ADMIN_CHAT_ID sozlanmagan — fikrlar adminga yuborilmaydi.');
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
