// ===== AUTH MODULE =====

/**
 * Sign up a new user and create their profile
 */
async function signUp(email, password, username) {
    // Check if username is already taken
    const { data: existing } = await sb
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

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
    // Mark offline before logging out
    const user = await getCurrentUser();
    if (user) {
        await sb.from('users').update({ online_status: false }).eq('id', user.id);
    }
    const { error } = await sb.auth.signOut();
    if (error) throw error;
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
    const { data, error } = await sb
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}

/**
 * Route guard – call at top of every protected page.
 * Redirects to index.html if not authenticated.
 * Returns the { user, profile } if authenticated.
 */
async function requireAuth() {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '/index.html';
        return null;
    }
    const profile = await getUserProfile(user.id);

    // Set online status
    await sb.from('users').update({ online_status: true }).eq('id', user.id);

    // Mark offline when tab closes / browser navigates away
    window.addEventListener('beforeunload', () => {
        // Use navigator.sendBeacon for reliability on unload
        const payload = JSON.stringify({ online_status: false });
        // We do a best-effort update; full reliability requires Supabase presence
        sb.from('users').update({ online_status: false }).eq('id', user.id);
    });

    return { user, profile };
}

/**
 * Redirect to dashboard if already logged in (use on auth page)
 */
async function redirectIfLoggedIn() {
    const user = await getCurrentUser();
    if (user) {
        window.location.href = '/dashboard.html';
    }
}

// Expose globally
window.Auth = {
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    getUserProfile,
    requireAuth,
    redirectIfLoggedIn
};
