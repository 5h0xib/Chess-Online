# ♚ Chess Online: Full-Stack Multiplayer & AI Chess Platform

Welcome to **Chess Online**, a comprehensive, fully functional web-based chess application. The platform provides a rich environment for players to engage against a highly tuned Custom Chess AI or challenge other players globally in real-time. 

Built entirely with standard Web Technologies (HTML, CSS, Vanilla JavaScript) and powered by **Supabase** for backend services, Chess Online offers a modern glassmorphism UI, a robust account system, matchmaking, and a responsive realtime game engine.

---

## 🚀 Key Features

* **Custom Chess Engine (AI)**: A built-from-scratch JavaScript chess bot using Minimax algorithm, Alpha-Beta pruning, and Piece-Square table evaluations.
* **Real-time Online Multiplayer**: Play live chess against friends directly in the browser via WebSockets with ultra-low latency.
* **Complex Chess Logic**: Fully supports all chess rules, including En Passant, Pawn Promotion, Castling, Check, Checkmate, and Stalemate detection.
* **Authentication & Profiles**: Secure email/password login, custom usernames, and a player dashboard.
* **Social System**: Comprehensive friending system (searching, sending/accepting requests) and live status tracking.
* **Game History & State Restoration**: Matches are saved to the cloud (online) or `localStorage` (offline), allowing players to review past games or resume accidentally closed tabs.
* **Responsive Modern UI**: Built with a sleek Glassmorphism design and dark/light mode toggles.

---

## 🧠 The Custom Chess Engine (AI)

The application features a fully custom-built chess AI (`js/chess-engine.js`) designed to provide challenging gameplay without needing a backend server to calculate moves.

### AI Architecture & Techniques
1. **Minimax Algorithm**: The AI builds a game tree of future possible moves to evaluate the best outcome. It explores depth dynamically based on difficulty:
   * Easy: Depth 2
   * Medium: Depth 3
   * Hard: Depth 4
2. **Alpha-Beta Pruning**: Drastically optimises the Minimax algorithm by securely ignoring branches of the move-tree that definitely will not be reached, allowing the AI to calculate deeper structures in a fraction of the time.
3. **Move Ordering**: Before evaluating board states, the AI aggressively sorts possible moves (e.g., checking captures first). If a move captures a high-value piece (like a Queen) using a low-value piece (like a Pawn), it is prioritized. This exponentially speeds up Alpha-Beta pruning.
4. **Piece-Square Tables (PST)**: The bot doesn't just evaluate material advantage (Queen = 900, Pawn = 100); it evaluates *positional* advantage. Tables define the optimal squares for specific pieces. A knight in the center of the board scores higher than a knight on the edge.
5. **Dynamic Endgame Evaluation**: Upon detecting an endgame scenario (when major pieces are traded off), the AI shifts its logic. The King becomes an active attacking piece, and the engine starts rewarding moves that drive the opponent's king toward the corners of the board to force a checkmate.

---

## 🗄️ Database Architecture (Supabase / PostgreSQL)

The entire backend is managed through **Supabase**, leveraging PostgreSQL for persistent data storage and Supabase Realtime for WebSocket event broadcasting.

### Core Database Tables
All tables are heavily secured using Postgres **Row Level Security (RLS)**, ensuring users can only read/write data they are authorized to interact with.

* **`users` Table**: Stores profile metadata tied to Supabase Auth. Includes `id` (foreign key to auth.users), `username`, `created_at`, and `last_seen`.
* **`friends` Table**: Manages the social graph. Tracks `user_id`, `friend_id`, and `status` ('pending' or 'accepted'). RLS ensures users can only see their own connections.
* **`games` Table**: The core table for matchmaking. 
  * Tracks `player_white` and `player_black`.
  * Maintains the `status` (waiting, active, finished).
  * Holds the stringified `board_state` JSON, capturing history, castling rights, and board layout for resuming.
* **`moves` Table**: An append-only table recording every move made in online play.
  * Columns: `game_id`, `player_id`, `move_data` (JSON: fromRow, fromCol, toRow, toCol, promotion).
  * *Real-Time Hook:* Supabase Realtime listens to `INSERT` statements on this table and instantly broadcasts the `move_data` payload to the opposing player's browser.
* **`notifications` Table**: Powers the toast-notification system for friend requests and game challenges.

### Realtime Synchronization
In online mode (`game.js`), the app creates two active WebSocket subscriptions:
1. `movesChannel`: Listens for `INSERT` events on the `moves` table where `game_id` matches the current room. 
2. `gameChannel`: Listens for `UPDATE` events on the `games` table to detect when an opponent resigns or a game successfully concludes.

---

## 🏗️ Project Structure

```text
Chess-Online/
├── index.html              ← Landing Page & Auth Login/Signup
├── dashboard.html          ← Central hub for Online presence and Offline modes
├── friends.html            ← Social/networking page
├── game.html               ← Core chess board and game view
├── history.html            ← Game History viewer
├── assets/                 ← Images, SVG pieces, logos
├── css/                    
│   ├── base.css            ← Shared UI / Variables / Design System
│   └── game.css            ← Chessboard grid, highlights, animations
├── js/
│   ├── auth.js             ← Wraps Supabase Auth, protects routes
│   ├── chess-engine.js     ← ♟️ The Core Move Generator & Minimax AI
│   ├── game.js             ← Handles online/offline modes, DOM updates, moves
│   ├── supabase-client.js  ← Backend initialization
│   └── ...                 ← Dashboard, Friends, Notifications, History logic
└── supabase/
    └── schema.sql          ← Full database schema to recreate the environment
```

---

## 🛡️ Security & Environment setup

### 1. Configure Supabase Instance
To run this application yourself, you need a Supabase backend:
1. Create a free project at [supabase.com](https://supabase.com).
2. Grab your `Project URL` and `anon public key` from Settings -> API.
3. Replace the variables in `js/supabase-client.js`.

### 2. Run the Schema
Copy the contents of `supabase/schema.sql` and run it in the Supabase SQL Editor. This will automatically spin up all tables and apply the strict Row Level Security rules to lock down your data.

### Security Notes
* The `SUPABASE_ANON_KEY` kept in `supabase-client.js` is perfectly safe to be exposed to the public internet because all direct database operations are protected by the RLS policies instantiated in step 2.
* **Never** expose the `SERVICE_ROLE` key.

---

## 🎨 Design & UI Philosophy
The application deviates from generic flat themes by employing a rich glassmorphism UI overlay on dynamic abstract backgrounds. It seamlessly supports `(prefers-color-scheme)` queries and allows users to manually switch between deeply optimized Dark and Light themes. The chessboard itself uses `aspect-ratio: 1/1` paired with responsive CSS Grids to ensure perfect rendering across 4K displays and mobile phones alike.
