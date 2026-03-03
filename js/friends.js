// ===== FRIENDS MODULE =====

let currentUserId = null;

async function initFriends(userId) {
    currentUserId = userId;
    setupSearchBar();
    setupTabs();
    await loadAllTabs();
    Notifications.subscribeToFriendRequests(userId);
}

// ===== TABS =====
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(btn.dataset.tab);
            if (panel) panel.classList.add('active');
        });
    });
}

async function loadAllTabs() {
    await Promise.all([loadFriends(), loadPendingReceived(), loadPendingSent()]);
}

// ===== LOAD FRIENDS =====
async function loadFriends() {
    const list = document.getElementById('friendsList');
    if (!list) return;
    list.innerHTML = '<div class="empty-state"><div class="icon">⏳</div></div>';

    const { data, error } = await sb
        .from('friends')
        .select('friend_id, users!friends_friend_id_fkey(id, username, online_status)')
        .eq('user_id', currentUserId);

    if (error || !data?.length) {
        list.innerHTML = `<div class="empty-state">
            <div class="icon">👥</div>
            <h3>No friends yet</h3>
            <p>Search for users and send requests!</p>
        </div>`;
        return;
    }

    list.innerHTML = '';
    data.forEach(row => {
        const friend = row.users;
        const card = createFriendCard(friend, 'friend');
        list.appendChild(card);
    });
}

// ===== LOAD PENDING RECEIVED =====
async function loadPendingReceived() {
    const list = document.getElementById('receivedList');
    if (!list) return;

    const { data } = await sb
        .from('friend_requests')
        .select('id, sender_id, users!friend_requests_sender_id_fkey(id, username, online_status)')
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending');

    if (!data?.length) {
        list.innerHTML = `<div class="empty-state"><div class="icon">📭</div><h3>No pending requests</h3></div>`;
        return;
    }

    list.innerHTML = '';
    data.forEach(req => {
        const sender = req.users;
        const card = createFriendCard(sender, 'pending-received', req.id);
        list.appendChild(card);
    });

    // Update tab badge
    const badge = document.getElementById('pendingBadge');
    if (badge) badge.textContent = data.length;
}

// ===== LOAD PENDING SENT =====
async function loadPendingSent() {
    const list = document.getElementById('sentList');
    if (!list) return;

    const { data } = await sb
        .from('friend_requests')
        .select('id, receiver_id, users!friend_requests_receiver_id_fkey(id, username, online_status)')
        .eq('sender_id', currentUserId)
        .eq('status', 'pending');

    if (!data?.length) {
        list.innerHTML = `<div class="empty-state"><div class="icon">📤</div><h3>No sent requests</h3></div>`;
        return;
    }

    list.innerHTML = '';
    data.forEach(req => {
        const receiver = req.users;
        const card = createFriendCard(receiver, 'pending-sent', req.id);
        list.appendChild(card);
    });
}

// ===== CREATE FRIEND CARD =====
function createFriendCard(user, type, requestId = null) {
    const card = document.createElement('div');
    card.className = 'friend-card';

    const initial = (user.username || '?')[0].toUpperCase();
    const isOnline = user.online_status;

    let actionsHtml = '';
    if (type === 'friend') {
        actionsHtml = `
            <button class="btn btn-primary btn-sm" onclick="challengeFriend('${user.id}', '${user.username}')">⚔️ Challenge</button>
            <button class="btn btn-danger btn-sm" onclick="removeFriend('${user.id}')">Remove</button>
        `;
    } else if (type === 'pending-received') {
        actionsHtml = `
            <button class="btn btn-success btn-sm" onclick="acceptRequest('${requestId}')">✓ Accept</button>
            <button class="btn btn-danger btn-sm" onclick="rejectRequest('${requestId}')">✕ Decline</button>
        `;
    } else if (type === 'pending-sent') {
        actionsHtml = `
            <span class="pending-label">⏳ Pending</span>
            <button class="btn btn-ghost btn-sm" onclick="cancelRequest('${requestId}')">Cancel</button>
        `;
    }

    card.innerHTML = `
        <div class="avatar">${initial}</div>
        <div style="display:flex;align-items:center;gap:6px;">
            <div class="online-dot ${isOnline ? 'online' : ''}"></div>
        </div>
        <div class="fc-info">
            <div class="fc-name">${escapeHtml(user.username)}</div>
            <div class="fc-meta">${isOnline ? '🟢 Online' : '⚫ Offline'}</div>
        </div>
        <div class="fc-actions">${actionsHtml}</div>
    `;
    return card;
}

// ===== ACTIONS =====
async function acceptRequest(requestId) {
    try {
        const { error } = await sb.rpc('accept_friend_request', { request_id: requestId });
        if (error) throw error;
        Notifications.showToast({ type: 'success', title: 'Friend Added!', message: 'You are now friends.' });
        await loadAllTabs();
    } catch (e) {
        Notifications.showToast({ type: 'error', title: 'Error', message: e.message });
    }
}

async function rejectRequest(requestId) {
    await sb.from('friend_requests').update({ status: 'rejected' }).eq('id', requestId);
    await loadAllTabs();
}

async function cancelRequest(requestId) {
    await sb.from('friend_requests').delete().eq('id', requestId);
    await loadAllTabs();
}

async function removeFriend(friendId) {
    if (!confirm('Remove this friend?')) return;
    await sb.from('friends').delete().eq('user_id', currentUserId).eq('friend_id', friendId);
    await sb.from('friends').delete().eq('user_id', friendId).eq('friend_id', currentUserId);
    await loadFriends();
}

async function challengeFriend(friendId, friendName) {
    try {
        // Create a pending challenge
        const { data, error } = await sb.from('game_challenges').insert({
            challenger_id: currentUserId,
            challenged_id: friendId,
            status: 'pending'
        }).select().single();

        if (error) throw error;

        Notifications.showToast({
            type: 'info',
            title: 'Challenge Sent!',
            message: `Waiting for ${friendName} to accept...`,
            duration: 30000
        });

        // Subscribe to the response
        Notifications.subscribeToChallengeAccepted(currentUserId);

    } catch (e) {
        Notifications.showToast({ type: 'error', title: 'Error', message: e.message });
    }
}

// ===== SEARCH BAR =====
function setupSearchBar() {
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    if (!input || !results) return;

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 2) {
            results.innerHTML = '';
            results.style.display = 'none';
            return;
        }
        // Show loading state immediately
        results.innerHTML = `<div class="search-result-item"><span style="color:var(--text-muted)">🔍 Searching...</span></div>`;
        results.style.display = 'block';
        debounceTimer = setTimeout(() => searchUsers(q), 350);
    });

    // Use mousedown instead of click so the dropdown is not hidden
    // before the button's onclick fires (click fires after mousedown + mouseup)
    document.addEventListener('mousedown', (e) => {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            results.style.display = 'none';
        }
    });

    // Also hide on Escape key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { results.style.display = 'none'; input.blur(); }
    });
}

async function searchUsers(query) {
    const results = document.getElementById('searchResults');
    const { data } = await sb
        .from('users')
        .select('id, username, online_status')
        .ilike('username', `%${query}%`)
        .neq('id', currentUserId)
        .limit(8);

    if (!data?.length) {
        results.innerHTML = `<div class="search-result-item"><span style="color:var(--text-muted)">No users found</span></div>`;
        results.style.display = 'block';
        return;
    }

    results.innerHTML = data.map(u => `
        <div class="search-result-item" data-uid="${u.id}">
            <div class="avatar avatar-sm">${u.username[0].toUpperCase()}</div>
            <div>
                <div class="sname">${escapeHtml(u.username)}</div>
                <div class="semail">${u.online_status ? '🟢 Online' : '⚫ Offline'}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="sendFriendRequest('${u.id}', '${escapeHtml(u.username)}')">
                + Add
            </button>
        </div>
    `).join('');
    results.style.display = 'block';
}

async function sendFriendRequest(targetId, targetName) {
    try {
        // Check if there's already a pending/accepted request in either direction
        // Use two separate queries to avoid complex OR/AND PostgREST syntax issues
        const [{ data: sent }, { data: received }] = await Promise.all([
            sb.from('friend_requests')
                .select('id, status')
                .eq('sender_id', currentUserId)
                .eq('receiver_id', targetId)
                .maybeSingle(),
            sb.from('friend_requests')
                .select('id, status')
                .eq('sender_id', targetId)
                .eq('receiver_id', currentUserId)
                .maybeSingle()
        ]);

        const existing = sent || received;
        if (existing) {
            const msg = existing.status === 'pending'
                ? 'Friend request already sent or pending.'
                : `Already connected (${existing.status}).`;
            Notifications.showToast({ type: 'info', title: 'Already Connected', message: msg });
            return;
        }

        const { error } = await sb.from('friend_requests').insert({
            sender_id: currentUserId,
            receiver_id: targetId
        });
        if (error) throw error;

        Notifications.showToast({ type: 'success', title: '✅ Request Sent!', message: `Friend request sent to ${targetName}` });
        document.getElementById('searchResults').style.display = 'none';
        document.getElementById('searchInput').value = '';
        await loadPendingSent();
    } catch (e) {
        console.error('[sendFriendRequest]', e);
        Notifications.showToast({ type: 'error', title: 'Error', message: e.message || 'Could not send friend request.' });
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Expose for onclick handlers in HTML
window.acceptRequest = acceptRequest;
window.rejectRequest = rejectRequest;
window.cancelRequest = cancelRequest;
window.removeFriend = removeFriend;
window.challengeFriend = challengeFriend;
window.sendFriendRequest = sendFriendRequest;

window.FriendsModule = { initFriends, loadFriends };
