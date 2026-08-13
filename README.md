# Kitobxon bot serveri

Bu server Telegram botiga yozgan foydalanuvchilarni saqlaydi va ularga bir vaqtda e'lon (xabar) yuborish imkonini beradi.

## 1-qadam: GitHub'ga yuklash

1. https://github.com sahifasiga kiring (akkaunt bo'lmasa, ro'yxatdan o'ting — bepul)
2. Yuqori o'ngdagi **"+"** → **"New repository"**
3. Repository nomi: `kitobxon-bot` → **"Create repository"**
4. Ochilgan sahifada **"uploading an existing file"** havolasini bosing
5. Shu papkadagi barcha fayllarni (`server.js`, `package.json`, `.gitignore`, `.env.example`, `README.md`) sudrab tashlang
   - **`.env` faylini hech qachon yuklamang** — u maxfiy tokenlarni saqlaydi
6. Pastda **"Commit changes"** tugmasini bosing

## 2-qadam: Telegram botini yaratish (agar hali qilmagan bo'lsangiz)

1. Telegramda **@BotFather**ga yozing
2. `/newbot` → nom va username bering
3. Sizga beriladigan **tokenni** saqlab qo'ying (masalan: `123456:ABC-DEF...`)

## 3-qadam: Render.com'da serverni ishga tushirish

1. https://render.com sahifasiga kiring, GitHub akkauntingiz bilan ro'yxatdan o'ting
2. Dashboard'da **"New +"** → **"Web Service"**
3. GitHub repolaringiz ro'yxatidan `kitobxon-bot`ni tanlang
4. Sozlamalar:
   - **Name**: `kitobxon-bot` (yoki xohlagan nom)
   - **Region**: eng yaqin joy (Frankfurt tavsiya etiladi)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free**
5. **"Environment Variables"** bo'limida quyidagilarni qo'shing:
   - `BOT_TOKEN` = BotFather bergan token
   - `ADMIN_SECRET` = o'zingiz o'ylab topgan maxfiy so'z (masalan `mening_maxfiy_kalitim_2026`) — bu xabar yuborishda kerak bo'ladi, hech kimga aytmang
   - `MINI_APP_URL` = `https://kitobxonn.netlify.app/`
6. **"Create Web Service"** tugmasini bosing

Bir necha daqiqadan so'ng server ishga tushadi. Render sizga havola beradi, masalan: `https://kitobxon-bot.onrender.com`

**Eslatma**: Render'ning bepul rejasi 15 daqiqa faolsizlikdan keyin serverni "uxlatib qo'yadi", keyingi so'rovda 30-60 soniya ichida qayta uyg'onadi. Bot xabarlariga javob berish biroz kechikishi mumkin, lekin barqaror ishlaydi.

## 4-qadam: Sinab ko'rish

1. Telegramda botingizga `/start` yozing — sizga xush kelibsiz xabari va "Kitobxonni ochish" tugmasi kelishi kerak
2. E'lon yuborishni sinash uchun terminalda (yoki Postman kabi vositada):

```bash
curl -X POST https://kitobxon-bot.onrender.com/broadcast \
  -H "Content-Type: application/json" \
  -d '{"secret":"SIZNING_ADMIN_SECRET","message":"Salom! Yangi yangilanish chiqdi 📖"}'
```

Bu barcha `/start` bosgan foydalanuvchilarga xabar yuboradi.

## Muhim eslatmalar

- Foydalanuvchilar ro'yxati `users.json` faylida saqlanadi. Render'ning bepul diskilari **vaqtinchalik** — server qayta ishga tushganda (masalan yangi kod joylashtirilganda) bu fayl **o'chib ketishi mumkin**. Agar foydalanuvchilar ro'yxati doimiy saqlanishi muhim bo'lsa, keyinroq buni haqiqiy bazaga (masalan Render'ning bepul PostgreSQL'iga) ko'chirish tavsiya etiladi — kerak bo'lsa shuni ham sozlab beraman.
- `ADMIN_SECRET`ni hech kimga bermang — aks holda istalgan odam botingiz orqali barchaga xabar yubora oladi.
