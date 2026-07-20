// ===== AUTH MODULE =====

let _heartbeatInterval = null;

/**
 * Sign up a new user and create their profile
 */
async function signUp(email, password, username) {
    // Check if username is already taken
    const { data: existing } = await sb
        .from('users')
        .select('id')
        .eq('username', username)
        .maybeSingle();

    if (existing) {
        throw new Error('Username is already taken. Please choose another.');
    }

    // Create auth user (trigger will create the users profile row)
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: { username }
        }
    });

    if (error) throw error;
    return data;
}

/**
 * Sign in with email + password
 */
async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

/**
 * Sign out current user
 */
async function signOut() {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
    const user = await getCurrentUser();
    if (user) {
        await sb.from('users').update({ online_status: false }).eq('id', user.id);
    }
    await sb.auth.signOut();
}

/**
 * Get the currently authenticated Supabase user
 */
async function getCurrentUser() {
    const { data: { user } } = await sb.auth.getUser();
    return user;
}

/**
 * Get the user's profile row from our public.users table
 */
async function getUserProfile(userId) {
    const { data } = await sb
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
    return data;
}

/**
 * Ensure a profile row exists for the given user. Creates one if missing.
 */
async function ensureProfile(user) {
    // Try to fetch existing row
    let { data: profile } = await sb
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (!profile) {
        // Trigger didn't fire — create the row manually
        const username = user.user_metadata?.username
            || user.email.split('@')[0]
            || 'player_' + user.id.slice(0, 6);

        const { data: inserted } = await sb
            .from('users')
            .upsert({ id: user.id, email: user.email, username }, { onConflict: 'id' })
            .select()
            .maybeSingle();

        profile = inserted;
    }

    // Last-resort fallback so the page always has something to work with
    if (!profile) {
        profile = {
            id: user.id,
            email: user.email,
            username: user.user_metadata?.username || user.email.split('@')[0] || 'Player',
            online_status: false
        };
    }

    return profile;
}

/**
 * Route guard – call at top of every protected page.
 * Redirects to index.html if not authenticated.
 * Returns { user, profile } on success, null on redirect.
 */
async function requireAuth() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            window.location.href = '/index.html';
            return null;
        }

        const profile = await ensureProfile(user);

        // ── Presence heartbeat ──
        // Sends a pulse every 30s. Readers treat a user as "online" only
        // if last_seen is within the last 2 minutes, so a closed browser
        // (= no more heartbeats) naturally expires the status.
        const sendHeartbeat = () => {
            sb.from('users').update({
                online_status: true,
                last_seen: new Date().toISOString()
            }).eq('id', user.id).then(() => {});
        };
        sendHeartbeat(); // immediate first pulse

        if (_heartbeatInterval) clearInterval(_heartbeatInterval);
        _heartbeatInterval = setInterval(sendHeartbeat, 30000);

        // Best-effort immediate offline on tab/browser close
        window.addEventListener('beforeunload', () => {
            if (_heartbeatInterval) clearInterval(_heartbeatInterval);
            sb.from('users').update({ online_status: false }).eq('id', user.id);
        });

        return { user, profile };
    } catch (err) {
        console.error('[requireAuth] Unexpected error:', err);
        window.location.href = '/index.html';
        return null;
    }
}

/**
 * Redirect to dashboard if already logged in (use on auth page)
 */
async function redirectIfLoggedIn() {
    try {
        const user = await getCurrentUser();
        if (user) window.location.href = '/dashboard.html';
    } catch (e) { /* ignore */ }
}

/**
 * Determine if a user object represents a genuinely online user.
 * Requires online_status === true AND a recent heartbeat (< 2 minutes).
 * Handles: explicit sign-out (online_status=false), browser crash (last_seen stale).
 */
function isUserOnline(userObj) {
    if (!userObj || !userObj.online_status) return false;
    if (!userObj.last_seen) return false;
    return (Date.now() - new Date(userObj.last_seen).getTime()) < 120000; // 2 min
}

// Expose globally
window.Auth = {
    signUp, signIn, signOut,
    getCurrentUser, getUserProfile, ensureProfile,
    requireAuth, redirectIfLoggedIn, isUserOnline
};
