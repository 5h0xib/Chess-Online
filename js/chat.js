// ===== IN-GAME CHAT MODULE =====
// Real-time chat between opponents in online PvP games.
// Uses Supabase Realtime (postgres_changes on game_messages table).

let chatChannel = null;
let _chatGameId = null;
let _chatUserId = null;
let _chatUsername = '';
let _chatReadOnly = false;

/**
 * Initialize chat for an online game.
 * @param {string} gameId  – the active game row ID
 * @param {string} userId  – current user's auth ID
 * @param {string} username – current user's display name
 */
async function initChat(gameId, userId, username, readOnly = false) {
    _chatGameId = gameId;
    _chatUserId = userId;
    _chatUsername = username;
    _chatReadOnly = readOnly;

    // Show the chat card (hidden by default for local/AI games)
    const card = document.getElementById('gameChatCard');
    if (!card) return;
    card.style.display = 'flex';

    if (readOnly) {
        // Hide input bar in read-only mode
        const inputBar = card.querySelector('.chat-input-bar');
        if (inputBar) inputBar.style.display = 'none';
    } else {
        wireChatInput();
    }

    await loadChatHistory();

    // Only subscribe to realtime for active games
    if (!readOnly) subscribeToChatMessages();
}

// ===== INPUT WIRING =====
function wireChatInput() {
    const sendBtn = document.getElementById('chatSendBtn');
    const input = document.getElementById('chatInput');
    if (!sendBtn || !input) return;

    const doSend = () => {
        const text = input.value.trim();
        if (!text) return;
        sendChatMessage(text);
        input.value = '';
        input.focus();
    };

    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            doSend();
        }
    });
}

// ===== LOAD HISTORY (on join / rejoin) =====
async function loadChatHistory() {
    if (!_chatGameId) return;
    try {
        const { data, error } = await sb
            .from('game_messages')
            .select('id, game_id, sender_id, content, created_at, sender:users!game_messages_sender_id_fkey(username)')
            .eq('game_id', _chatGameId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const list = document.getElementById('chatMessagesList');
        if (!list) return;

        if (data && data.length > 0) {
            hideEmptyState();
            data.forEach(msg => appendBubble(msg));
            scrollChatToBottom();
        } else if (_chatReadOnly) {
            // Show a different message for past games with no chat
            const empty = document.getElementById('chatEmpty');
            if (empty) empty.innerHTML = '<i class="bi bi-chat-text" style="font-size:1.4rem;display:block;margin-bottom:6px;opacity:0.5;"></i>No messages were sent during this game';
        }
    } catch (e) {
        console.error('[Chat] Failed to load history:', e);
    }
}

// ===== REALTIME SUBSCRIPTION =====
function subscribeToChatMessages() {
    if (!_chatGameId) return;
    if (chatChannel) chatChannel.unsubscribe();

    chatChannel = sb
        .channel(`game_chat:${_chatGameId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'game_messages',
            filter: `game_id=eq.${_chatGameId}`
        }, async (payload) => {
            const row = payload.new;
            // Skip our own messages (already rendered optimistically)
            if (row.sender_id === _chatUserId) return;

            // Fetch sender name
            const { data: sender } = await sb
                .from('users')
                .select('username')
                .eq('id', row.sender_id)
                .single();

            row.sender = sender || { username: 'Opponent' };
            hideEmptyState();
            appendBubble(row);
            scrollChatToBottom();
        })
        .subscribe();
}

// ===== SEND MESSAGE =====
async function sendChatMessage(content) {
    if (!_chatGameId || !_chatUserId || !content) return;

    // Optimistic render
    const tempMsg = {
        id: `temp-${Date.now()}`,
        sender_id: _chatUserId,
        content,
        created_at: new Date().toISOString(),
        sender: { username: _chatUsername }
    };
    hideEmptyState();
    appendBubble(tempMsg);
    scrollChatToBottom();

    try {
        const { error } = await sb.from('game_messages').insert({
            game_id: _chatGameId,
            sender_id: _chatUserId,
            content
        });
        if (error) throw error;
    } catch (e) {
        console.error('[Chat] Send failed:', e);
        Notifications.showToast({ type: 'error', title: 'Chat Error', message: 'Message failed to send.' });
    }
}

// ===== RENDER A SINGLE MESSAGE BUBBLE =====
function appendBubble(msg) {
    const list = document.getElementById('chatMessagesList');
    if (!list) return;

    const isMine = msg.sender_id === _chatUserId;
    const name = isMine ? 'You' : (msg.sender?.username || 'Opponent');
    const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const el = document.createElement('div');
    el.className = `chat-msg ${isMine ? 'sent' : 'received'}`;
    el.dataset.msgId = msg.id;
    el.innerHTML = `
        <div class="chat-msg-name">${chatEsc(name)}</div>
        <div class="chat-msg-bubble">${chatEsc(msg.content)}</div>
        <div class="chat-msg-time">${time}</div>
    `;
    list.appendChild(el);
}

// ===== HELPERS =====
function scrollChatToBottom() {
    const list = document.getElementById('chatMessagesList');
    if (list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

function hideEmptyState() {
    const empty = document.getElementById('chatEmpty');
    if (empty) empty.style.display = 'none';
}

function chatEsc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function destroyChat() {
    if (chatChannel) { chatChannel.unsubscribe(); chatChannel = null; }
    _chatGameId = null;
}

// ===== EXPOSE =====
window.GameChat = { initChat, destroyChat, sendChatMessage };
