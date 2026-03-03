// ===== DASHBOARD MODULE =====

let dashProfile = null;
let dashUser = null;

async function initDashboard() {
    try {
        const auth = await Auth.requireAuth();
        if (!auth) return;
        dashUser = auth.user;
        dashProfile = auth.profile;

        renderUserInfo();
        await Promise.all([loadStats(), loadFriendsSidebar(), loadRecentGames()]);

        Notifications.subscribeToGameChallenges(dashUser.id, dashProfile);
        Notifications.subscribeToFriendRequests(dashUser.id);
        Notifications.subscribeToChallengeAccepted(dashUser.id);

        subscribeToOnlineStatus();
        setupActions();
    } catch (err) {
        console.error('[Dashboard] Init error:', err);
        Notifications.showToast({ type: 'error', title: 'Dashboard Error', message: err.message || 'Something went wrong loading the dashboard.' });
    } finally {
        hideLoader();
    }
}

function renderUserInfo() {
    const el = (id) => document.getElementById(id);
    if (el('navUsername')) el('navUsername').textContent = dashProfile.username;
    if (el('welcomeName')) el('welcomeName').textContent = `Hey, ${dashProfile.username}! 👋`;
    if (el('navAvatar')) el('navAvatar').textContent = dashProfile.username[0].toUpperCase();
}

// ===== STATS =====
async function loadStats() {
    const uid = dashUser.id;

    try {
        const [winsRes, lossesRes, friendsRes] = await Promise.all([
            sb.from('games').select('*', { count: 'exact', head: true })
                .or(`player_white.eq.${uid},player_black.eq.${uid}`)
                .eq('status', 'finished')
                .or(`and(winner.eq.white,player_white.eq.${uid}),and(winner.eq.black,player_black.eq.${uid})`),
            sb.from('games').select('*', { count: 'exact', head: true })
                .or(`player_white.eq.${uid},player_black.eq.${uid}`)
                .eq('status', 'finished')
                .or(`and(winner.eq.black,player_white.eq.${uid}),and(winner.eq.white,player_black.eq.${uid})`),
            sb.from('friends').select('*', { count: 'exact', head: true }).eq('user_id', uid)
        ]);

        const totalRes = await sb.from('games').select('*', { count: 'exact', head: true })
            .or(`player_white.eq.${uid},player_black.eq.${uid}`)
            .eq('status', 'finished');

        const wins = winsRes.count || 0;
        const losses = lossesRes.count || 0;
        const total = totalRes.count || 0;

        setEl('statWins', wins);
        setEl('statLosses', losses);
        setEl('statDraws', total - wins - losses);
        setEl('statFriends', friendsRes.count || 0);
    } catch (e) {
        console.warn('Stats load error:', e);
        ['statWins', 'statLosses', 'statDraws', 'statFriends'].forEach(id => setEl(id, 0));
    }
}

function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ===== FRIENDS SIDEBAR =====
async function loadFriendsSidebar() {
    const list = document.getElementById('friendsSidebar');
    if (!list) return;

    try {
        const { data } = await sb
            .from('friends')
            .select('friend_id, users!friends_friend_id_fkey(id, username, online_status)')
            .eq('user_id', dashUser.id)
            .limit(10);

        if (!data?.length) {
            list.innerHTML = `<div class="empty-state" style="padding:20px">
                <div class="icon">👥</div><h3>No friends yet</h3>
                <p><a href="friends.html" style="color:var(--accent-purple-light)">Find friends →</a></p>
            </div>`;
            return;
        }

        list.innerHTML = data.map(row => {
            const f = row.users;
            if (!f) return '';
            return `<div class="friend-item">
                <div class="avatar avatar-sm">${f.username[0].toUpperCase()}</div>
                <div class="online-dot ${f.online_status ? 'online' : ''}"></div>
                <div class="friend-info">
                    <div class="friend-name">${escHtml(f.username)}</div>
                    <div class="friend-status">${f.online_status ? 'Online' : 'Offline'}</div>
                </div>
                <div class="friend-actions">
                    <button class="btn btn-ghost btn-sm" onclick="dashChallenge('${f.id}','${escHtml(f.username)}')">⚔️</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = `<div class="empty-state" style="padding:20px"><div class="icon">⚠️</div><h3>Could not load friends</h3></div>`;
    }
}

// ===== RECENT GAMES =====
async function loadRecentGames() {
    const list = document.getElementById('recentGames');
    if (!list) return;
    const uid = dashUser.id;

    try {
        const { data } = await sb
            .from('games')
            .select('id, player_white, player_black, status, winner, created_at, users_white:users!games_player_white_fkey(username), users_black:users!games_player_black_fkey(username)')
            .or(`player_white.eq.${uid},player_black.eq.${uid}`)
            .eq('status', 'finished')
            .order('created_at', { ascending: false })
            .limit(5);

        if (!data?.length) {
            list.innerHTML = `<div class="empty-state" style="padding:20px">
                <div class="icon">♟️</div><h3>No games yet</h3>
                <p>Challenge a friend to get started!</p>
            </div>`;
            return;
        }

        list.innerHTML = data.map(g => {
            const isWhite = g.player_white === uid;
            const oppName = isWhite ? g.users_black?.username : g.users_white?.username;
            let result = 'draw', resultLabel = 'Draw';
            if (g.winner) {
                const won = (g.winner === 'white' && isWhite) || (g.winner === 'black' && !isWhite);
                result = won ? 'win' : 'loss';
                resultLabel = won ? 'Win' : 'Loss';
            }
            const date = new Date(g.created_at).toLocaleDateString();
            return `<div class="game-row" onclick="window.location='game.html?view=${g.id}'">
                <div class="game-icon">♟️</div>
                <div class="game-info">
                    <div class="game-opponent">vs ${escHtml(oppName || 'Unknown')}</div>
                    <div class="game-meta">${isWhite ? 'White' : 'Black'} • ${date}</div>
                </div>
                <div class="game-result ${result}">${resultLabel}</div>
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = `<div class="empty-state" style="padding:20px"><div class="icon">⚠️</div><h3>Could not load games</h3></div>`;
    }
}

// ===== REALTIME ONLINE STATUS =====
function subscribeToOnlineStatus() {
    sb.channel('online-users')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, () => {
            loadFriendsSidebar();
        })
        .subscribe();
}

// ===== ACTIONS =====
function setupActions() {
    document.getElementById('btnPlayComputer')?.addEventListener('click', () => {
        window.location.href = 'game.html?mode=pvc';
    });
    document.getElementById('btnChallengeFriend')?.addEventListener('click', () => {
        window.location.href = 'friends.html';
    });
    document.getElementById('btnFriends')?.addEventListener('click', () => {
        window.location.href = 'friends.html';
    });
    document.getElementById('btnHistory')?.addEventListener('click', () => {
        window.location.href = 'history.html';
    });
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await Auth.signOut();
        window.location.href = 'index.html';
    });
}

async function dashChallenge(friendId, friendName) {
    try {
        await sb.from('game_challenges').insert({
            challenger_id: dashUser.id,
            challenged_id: friendId,
            status: 'pending'
        });
        Notifications.showToast({ type: 'info', title: 'Challenge Sent!', message: `Waiting for ${friendName}...`, duration: 20000 });
        Notifications.subscribeToChallengeAccepted(dashUser.id);
    } catch (e) {
        Notifications.showToast({ type: 'error', title: 'Error', message: e.message });
    }
}

function hideLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 500); }
}

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.dashChallenge = dashChallenge;
window.DashboardModule = { initDashboard };
