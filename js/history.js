// ===== HISTORY MODULE =====

let historyUser = null;
let allGames = [];
let currentFilter = 'all';

async function initHistory() {
    const auth = await Auth.requireAuth();
    if (!auth) return;
    historyUser = auth.user;

    renderUserInfo(auth.profile);
    await loadGameHistory();
    setupFilters();
    setupLogout();
    hideLoader();
}

function renderUserInfo(profile) {
    const el = document.getElementById('navUsername');
    if (el) el.textContent = profile.username;
    const av = document.getElementById('navAvatar');
    if (av) av.textContent = profile.username[0].toUpperCase();
}

async function loadGameHistory() {
    const uid = historyUser.id;

    const { data, error } = await sb
        .from('games')
        .select('id, player_white, player_black, status, winner, created_at, move_count:moves(count), users_white:users!games_player_white_fkey(username), users_black:users!games_player_black_fkey(username)')
        .or(`player_white.eq.${uid},player_black.eq.${uid}`)
        .eq('status', 'finished')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    allGames = (data || []).map(g => {
        const isWhite = g.player_white === uid;
        const oppName = isWhite ? g.users_black?.username : g.users_white?.username;
        const myColor = isWhite ? 'white' : 'black';
        let result = 'draw';
        if (g.winner) {
            result = (
                (g.winner === 'white' && isWhite) ||
                (g.winner === 'black' && !isWhite)
            ) ? 'win' : 'loss';
        }
        return {
            id: g.id,
            opponent: oppName || 'Unknown',
            myColor,
            result,
            date: new Date(g.created_at),
            moveCount: g.move_count?.[0]?.count ?? '—'
        };
    });

    renderTable(allGames);
    updateSummaryStats();
}

function renderTable(games) {
    const tbody = document.getElementById('historyTbody');
    if (!tbody) return;

    if (!games.length) {
        tbody.innerHTML = `<tr><td colspan="5">
            <div class="empty-state" style="padding:40px">
                <div class="icon">♟️</div>
                <h3>No games found</h3>
                <p>Play some games to see your history here!</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = games.map(g => {
        const resultClass = `result-${g.result}`;
        const resultLabel = g.result.charAt(0).toUpperCase() + g.result.slice(1);
        const colorClass = `color-${g.myColor}`;
        const colorLabel = g.myColor.charAt(0).toUpperCase() + g.myColor.slice(1);
        const dateStr = g.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        return `<tr onclick="window.location='/game.html?view=${g.id}'" title="View game">
            <td><strong>${escHtml(g.opponent)}</strong></td>
            <td><span class="${colorClass}">${colorLabel}</span></td>
            <td><span class="${resultClass}">${resultLabel}</span></td>
            <td><span class="moves-count">${g.moveCount}</span></td>
            <td><span class="game-date">${dateStr}</span></td>
        </tr>`;
    }).join('');
}

function updateSummaryStats() {
    const wins = allGames.filter(g => g.result === 'win').length;
    const losses = allGames.filter(g => g.result === 'loss').length;
    const draws = allGames.filter(g => g.result === 'draw').length;
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('totalGames', allGames.length);
    setEl('totalWins', wins);
    setEl('totalLosses', losses);
    setEl('totalDraws', draws);
}

function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            const filtered = currentFilter === 'all'
                ? allGames
                : allGames.filter(g => g.result === currentFilter);
            renderTable(filtered);
        });
    });
}

function setupLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await Auth.signOut();
        window.location.href = 'index.html';
    });
}

function hideLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 500); }
}

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

window.HistoryModule = { initHistory };
