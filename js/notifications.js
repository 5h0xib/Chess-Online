// ===== TOAST / NOTIFICATIONS MODULE =====
// Provides toast alerts + Supabase Realtime subscriptions for
// game challenges and friend requests.

const TOAST_DURATION = 8000; // ms

function showToast({ type = 'info', title, message, actionLabel, onAction, duration = TOAST_DURATION }) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        info: '<i class="bi bi-info-circle-fill"></i>',
        success: '<i class="bi bi-check-circle-fill"></i>',
        error: '<i class="bi bi-x-circle-fill"></i>',
        challenge: '<i class="bi bi-trophy-fill"></i>'
    };
    toast.innerHTML = `
        <span class="toast-icon ${type}">${icons[type] || '<i class="bi bi-bell-fill"></i>'}</span>
        <div class="toast-body">
            <div class="toast-title">${title || ''}</div>
            ${message ? `<div class="toast-msg">${message}</div>` : ''}
        </div>
        ${actionLabel ? `<button class="toast-action" id="ta-${Date.now()}">${actionLabel}</button>` : ''}
        <button class="toast-close"><i class="bi bi-x"></i></button>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.onclick = () => removeToast(toast);

    if (actionLabel) {
        const actionBtn = toast.querySelector('.toast-action');
        actionBtn.onclick = () => { if (onAction) onAction(); removeToast(toast); };
    }

    if (duration > 0) {
        setTimeout(() => removeToast(toast), duration);
    }

    return toast;
}

function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.add('removing');
    setTimeout(() => { if (toast.parentElement) toast.parentElement.removeChild(toast); }, 300);
}

// ===== REALTIME SUBSCRIPTIONS =====
let challengeChannel = null;
let friendRequestChannel = null;

/**
 * Start listening for incoming game challenges.
 * @param {string} userId - the current user's ID
 * @param {object} myProfile - the current user's profile
 */
function subscribeToGameChallenges(userId, myProfile) {
    if (challengeChannel) challengeChannel.unsubscribe();

    challengeChannel = sb
        .channel(`challenges:${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'game_challenges',
            filter: `challenged_id=eq.${userId}`
        }, async (payload) => {
            const challenge = payload.new;
            if (challenge.status !== 'pending') return;

            // Fetch challenger profile
            const { data: challenger } = await sb
                .from('users')
                .select('username')
                .eq('id', challenge.challenger_id)
                .single();

            const name = challenger?.username || 'Someone';

            showToast({
                type: 'challenge',
                title: 'Game Challenge!',
                message: `${name} wants to play chess with you`,
                actionLabel: 'Accept',
                duration: 20000,
                onAction: async () => {
                    await acceptGameChallenge(challenge.id, challenge.challenger_id, userId);
                }
            });

            // Also show a reject option via another toast
            showToast({
                type: 'info',
                title: `Challenge from ${name}`,
                message: 'Tap below to decline',
                actionLabel: 'Decline',
                duration: 20000,
                onAction: async () => {
                    await sb.from('game_challenges')
                        .update({ status: 'rejected' })
                        .eq('id', challenge.id);
                }
            });
        })
        .subscribe();
}

/**
 * Accept a game challenge: create a game room and redirect both players.
 */
async function acceptGameChallenge(challengeId, challengerId, myId) {
    try {
        // Randomly assign colors
        const isWhite = Math.random() > 0.5;
        const playerWhite = isWhite ? myId : challengerId;
        const playerBlack = isWhite ? challengerId : myId;

        // Create the game
        const { data: game, error: gameErr } = await sb.from('games').insert({
            player_white: playerWhite,
            player_black: playerBlack,
            board_state: {},
            current_turn: 'white',
            status: 'ongoing'
        }).select().single();

        if (gameErr) throw gameErr;

        // Update challenge with game_id and status
        await sb.from('game_challenges')
            .update({ status: 'accepted', game_id: game.id })
            .eq('id', challengeId);

        // Navigate to game
        window.location.href = `/game.html?gameId=${game.id}`;
    } catch (e) {
        console.error('Failed to accept challenge:', e);
        showToast({ type: 'error', title: 'Error', message: 'Could not start game. Try again.' });
    }
}

/**
 * Subscribe to friend request notifications for the current user.
 */
function subscribeToFriendRequests(userId) {
    if (friendRequestChannel) friendRequestChannel.unsubscribe();

    friendRequestChannel = sb
        .channel(`friend_reqs:${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'friend_requests',
            filter: `receiver_id=eq.${userId}`
        }, async (payload) => {
            const req = payload.new;
            const { data: sender } = await sb
                .from('users').select('username').eq('id', req.sender_id).single();
            const name = sender?.username || 'Someone';
            showToast({
                type: 'info',
                title: 'Friend Request',
                message: `${name} sent you a friend request`,
                actionLabel: 'View',
                onAction: () => { window.location.href = '/friends.html'; }
            });
        })
        .subscribe();
}

/**
 * Subscribe to challenge status updates (so challenger knows if accepted).
 */
function subscribeToChallengeAccepted(userId) {
    sb.channel(`challenge_accepted:${userId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'game_challenges',
            filter: `challenger_id=eq.${userId}`
        }, (payload) => {
            const ch = payload.new;
            if (ch.status === 'accepted' && ch.game_id) {
                showToast({
                    type: 'success',
                    title: 'Challenge Accepted!',
                    message: 'Your friend accepted. Starting game...',
                    duration: 3000
                });
                setTimeout(() => {
                    window.location.href = `/game.html?gameId=${ch.game_id}`;
                }, 1500);
            } else if (ch.status === 'rejected') {
                showToast({ type: 'error', title: 'Challenge Declined', message: 'Your friend declined the challenge.' });
            }
        })
        .subscribe();
}

function unsubscribeAll() {
    if (challengeChannel) challengeChannel.unsubscribe();
    if (friendRequestChannel) friendRequestChannel.unsubscribe();
}

window.Notifications = {
    showToast,
    subscribeToGameChallenges,
    subscribeToFriendRequests,
    subscribeToChallengeAccepted,
    acceptGameChallenge,
    unsubscribeAll
};
