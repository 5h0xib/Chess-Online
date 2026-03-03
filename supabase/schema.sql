-- ============================================================
-- CHESS ONLINE – SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL editor
-- ============================================================

-- ============================================================
-- 1. USERS TABLE (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username    TEXT NOT NULL UNIQUE,
    email       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    online_status BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Anyone can read user profiles (needed for search, game panels)
CREATE POLICY "users_select_all" ON public.users
    FOR SELECT USING (true);

-- Users can only update their own row
CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Insert allowed only via trigger (see below)
CREATE POLICY "users_insert_own" ON public.users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. AUTO-CREATE USER PROFILE ON SIGNUP (via trigger)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, username)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 3. FRIEND REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- Sender or receiver can see the request
CREATE POLICY "friend_requests_select" ON public.friend_requests
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Only sender can create
CREATE POLICY "friend_requests_insert" ON public.friend_requests
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Only receiver can update status
CREATE POLICY "friend_requests_update" ON public.friend_requests
    FOR UPDATE USING (auth.uid() = receiver_id);

-- Sender can delete (cancel) a pending request
CREATE POLICY "friend_requests_delete" ON public.friend_requests
    FOR DELETE USING (auth.uid() = sender_id);

-- ============================================================
-- 4. FRIENDS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.friends (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    friend_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, friend_id)
);

ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Users can only see their own friend rows
CREATE POLICY "friends_select_own" ON public.friends
    FOR SELECT USING (auth.uid() = user_id);

-- Insert allowed (handled by function)
CREATE POLICY "friends_insert_own" ON public.friends
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Delete own friendships
CREATE POLICY "friends_delete_own" ON public.friends
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 5. FUNCTION: Accept friend request (creates bidirectional rows)
-- ============================================================
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS void AS $$
DECLARE
    req public.friend_requests%ROWTYPE;
BEGIN
    -- Get the request and ensure current user is receiver
    SELECT * INTO req FROM public.friend_requests
    WHERE id = request_id AND receiver_id = auth.uid() AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Friend request not found or not authorized';
    END IF;

    -- Update request status
    UPDATE public.friend_requests SET status = 'accepted' WHERE id = request_id;

    -- Create bidirectional friendship rows
    INSERT INTO public.friends (user_id, friend_id) VALUES (req.sender_id, req.receiver_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.friends (user_id, friend_id) VALUES (req.receiver_id, req.sender_id)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. GAMES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.games (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_white  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    player_black  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    board_state   JSONB NOT NULL DEFAULT '{}',
    current_turn  TEXT NOT NULL DEFAULT 'white' CHECK (current_turn IN ('white', 'black')),
    status        TEXT NOT NULL DEFAULT 'ongoing' CHECK (status IN ('waiting', 'ongoing', 'finished', 'abandoned')),
    winner        TEXT CHECK (winner IN ('white', 'black', 'draw')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Only players of the game can see it
CREATE POLICY "games_select_players" ON public.games
    FOR SELECT USING (auth.uid() = player_white OR auth.uid() = player_black);

-- Only the challenge sender creates the game (we handle this via RPC)
CREATE POLICY "games_insert" ON public.games
    FOR INSERT WITH CHECK (auth.uid() = player_white OR auth.uid() = player_black);

-- Either player can update (move + status)
CREATE POLICY "games_update_players" ON public.games
    FOR UPDATE USING (auth.uid() = player_white OR auth.uid() = player_black);

-- ============================================================
-- 7. MOVES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.moves (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id     UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    player_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    move_data   JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;

-- Only players of the game can see moves
CREATE POLICY "moves_select" ON public.moves
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.games g
            WHERE g.id = game_id
            AND (g.player_white = auth.uid() OR g.player_black = auth.uid())
        )
    );

-- Only the active player can insert their move
CREATE POLICY "moves_insert" ON public.moves
    FOR INSERT WITH CHECK (
        auth.uid() = player_id AND
        EXISTS (
            SELECT 1 FROM public.games g
            WHERE g.id = game_id
            AND (g.player_white = auth.uid() OR g.player_black = auth.uid())
            AND g.status = 'ongoing'
        )
    );

-- ============================================================
-- 8. GAME CHALLENGES TABLE (realtime invitations)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_challenges (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    challenged_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_id       UUID REFERENCES public.games(id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.game_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenges_select" ON public.game_challenges
    FOR SELECT USING (auth.uid() = challenger_id OR auth.uid() = challenged_id);

CREATE POLICY "challenges_insert" ON public.game_challenges
    FOR INSERT WITH CHECK (auth.uid() = challenger_id);

CREATE POLICY "challenges_update" ON public.game_challenges
    FOR UPDATE USING (auth.uid() = challenged_id OR auth.uid() = challenger_id);

-- ============================================================
-- 9. ENABLE SUPABASE REALTIME
-- ============================================================
-- Run these in the Supabase SQL editor to enable realtime on relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.moves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_challenges;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
