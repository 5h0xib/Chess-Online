# ♚ Chess Online

A full-stack multiplayer chess web app built with HTML/CSS/JavaScript + **Supabase** (Auth, Database, Realtime).

Play vs Computer (AI) locally, or challenge friends to realtime online matches.

---

## 🚀 Quick Start

### Step 1 – Configure Supabase

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** and copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **Anon public key** (`eyJhbGci...`)
3. Open `js/supabase-client.js` and replace the placeholders:
```js
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### Step 2 – Set Up the Database

1. In your Supabase Dashboard, go to **SQL Editor**
2. Open and run the entire file: `supabase/schema.sql`
3. This creates all 5 tables with Row Level Security + triggers

### Step 3 – Configure Auth

In your Supabase Dashboard → **Authentication → URL Configuration**:
- **Site URL**: `https://chess.woxflow.in`
- **Redirect URLs**: same URL

### Step 4 – Deploy to GitHub Pages

```bash
# In the Chess-Online folder:
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/Chess-Online.git
git push -u origin main
```

Then on GitHub:
- Go to **Settings → Pages**
- Source: **Deploy from branch → main → / (root)**
- Your site will be live at `https://YOUR-USERNAME.github.io/Chess-Online`

---

## 📁 Project Structure

```
Chess-Online/
├── index.html          ← Login / Sign Up
├── dashboard.html      ← User dashboard
├── friends.html        ← Friends management
├── game.html           ← Chess game (online + vs AI)
├── history.html        ← Game history
├── css/
│   ├── base.css        ← Shared design system
│   ├── auth.css        ← Auth page
│   ├── dashboard.css
│   ├── friends.css
│   ├── game.css        ← Chess board + UI
│   └── history.css
├── js/
│   ├── supabase-client.js  ← ⚠️ Add your keys here
│   ├── auth.js             ← Auth helpers + route guard
│   ├── chess-engine.js     ← Full chess AI engine
│   ├── game.js             ← Online game + realtime
│   ├── friends.js          ← Friend system
│   ├── dashboard.js        ← Dashboard logic
│   ├── notifications.js    ← Toast + Realtime subs
│   └── history.js          ← Game history
└── supabase/
    └── schema.sql          ← Run this in Supabase SQL editor
```

---

## 🎮 Features

| Feature | Status |
|---|---|
| Email sign up / sign in | ✅ |
| Username-based profiles | ✅ |
| Online status (real-time) | ✅ |
| Friend search by username | ✅ |
| Send / accept / reject requests | ✅ |
| Challenge friend to game | ✅ |
| Real-time game invitations | ✅ |
| Random color assignment | ✅ |
| Real-time move sync (WebSocket) | ✅ |
| Turn enforcement | ✅ |
| Play vs AI (minimax + alpha-beta) | ✅ |
| Easy / Medium / Hard difficulty | ✅ |
| Castling, en passant, promotion | ✅ |
| Check, checkmate, stalemate | ✅ |
| Game history page | ✅ |
| Row Level Security (RLS) | ✅ |

---

## 🔒 Security Notes

- **Never** commit your Supabase **service role key** to Git
- The **anon key** is safe to expose in frontend code
- All database access is protected by **Row Level Security** policies
- Only game participants can view or update their game data

---

## 🛠 Tech Stack

- **Frontend**: HTML5, CSS3 (glassmorphism), Vanilla JavaScript
- **Backend / DB**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth (email + password)
- **Realtime**: Supabase Realtime (WebSocket / Postgres Changes)
- **Hosting**: GitHub Pages
- **Chess AI**: Minimax + Alpha-Beta pruning (depth 2–4)
