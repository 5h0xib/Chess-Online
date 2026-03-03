// ===== ONLINE GAME MODULE =====
// Handles: online multiplayer game rooms, realtime move sync,
//          turn enforcement, game completion, and PvC fallback.

let gameUser = null;
let gameProfile = null;
let gameData = null; // the games row
let movesChannel = null;
let gameChannel = null;

async function initGame() {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('gameId');
    const mode = params.get('mode');
    const viewId = params.get('view');

    const auth = await Auth.requireAuth();
    if (!auth) return;
    gameUser = auth.user;
    gameProfile = auth.profile;

    if (viewId) {
        await initViewMode(viewId);
    } else if (gameId) {
        await initOnlineGame(gameId);
    } else {
        initLocalGame(mode);
    }

    hideLoader();
}

// ===== LOCAL GAME (vs Computer or vs same-screen player) =====
function initLocalGame(mode) {
    gameState.isOnlineGame = false;

    const modeSelector = document.getElementById('gameModeSelector');
    if (modeSelector) modeSelector.style.display = 'flex';

    const hasSaved = loadGameState();
    if (hasSaved) {
        restoreModeSwitchers();
        restoreAlerts();
        renderBoard(false);
    } else {
        gameState.gameMode = mode === 'pvc' ? 'pvc' : 'pvp';
        const pvcSection = document.getElementById('difficultySection');
        if (pvcSection) pvcSection.style.display = mode === 'pvc' ? 'block' : 'none';
        const pvcRadio = document.querySelector(`input[name="gameMode"][value="${gameState.gameMode}"]`);
        if (pvcRadio) pvcRadio.checked = true;
        initializeBoard();
        renderBoard(false);
    }

    setupLocalControls();
    updatePlayerPanels(`${gameProfile.username} (You)`, 'Opponent', null);
}

function restoreModeSwitchers() {
    const modeRadio = document.querySelector(`input[name="gameMode"][value="${gameState.gameMode}"]`);
    if (modeRadio) modeRadio.checked = true;
    const diffRadio = document.querySelector(`input[name="difficulty"][value="${gameState.aiDifficulty}"]`);
    if (diffRadio) diffRadio.checked = true;
    const diffSec = document.getElementById('difficultySection');
    if (diffSec) diffSec.style.display = gameState.gameMode === 'pvc' ? 'block' : 'none';
}

function restoreAlerts() {
    if (gameState.gameStatus === 'checkmate') {
        const winner = gameState.currentTurn === 'white' ? 'Black' : 'White';
        showGameAlert(`Checkmate! ${winner} wins!`, 'checkmate');
    } else if (gameState.gameStatus === 'stalemate') {
        showGameAlert('Stalemate! Game is a draw.', 'stalemate');
    } else if (gameState.gameStatus === 'check') {
        showGameAlert(`${gameState.currentTurn === 'white' ? 'White' : 'Black'} is in check!`, 'check');
    }
}

function setupLocalControls() {
    document.getElementById('resetBtn')?.addEventListener('click', () => {
        resetGame();
        const pvcSection = document.getElementById('difficultySection');
        if (pvcSection) pvcSection.style.display = gameState.gameMode === 'pvc' ? 'block' : 'none';
    });

    document.querySelectorAll('input[name="gameMode"]').forEach(r => {
        r.addEventListener('change', (e) => {
            gameState.gameMode = e.target.value;
            const diffSec = document.getElementById('difficultySection');
            if (diffSec) diffSec.style.display = e.target.value === 'pvc' ? 'block' : 'none';
            resetGame();
        });
    });
    document.querySelectorAll('input[name="difficulty"]').forEach(r => {
        r.addEventListener('change', (e) => {
            gameState.aiDifficulty = e.target.value;
            resetGame();
        });
    });
}

// ===== ONLINE GAME INIT =====
async function initOnlineGame(gameId) {
    // Fetch game row
    const { data: game, error } = await sb.from('games').select('*').eq('id', gameId).single();
    if (error || !game) {
        Notifications.showToast({ type: 'error', title: 'Game not found', message: 'This game does not exist or you are not a player.' });
        setTimeout(() => window.location.href = '/dashboard.html', 2500);
        return;
    }

    if (game.player_white !== gameUser.id && game.player_black !== gameUser.id) {
        Notifications.showToast({ type: 'error', title: 'Access denied', message: 'You are not a player in this game.' });
        setTimeout(() => window.location.href = '/dashboard.html', 2500);
        return;
    }

    gameData = game;
    gameState.isOnlineGame = true;
    gameState.onlineGameId = gameId;
    gameState.myColor = game.player_white === gameUser.id ? 'white' : 'black';

    // Hide local mode selector
    const modeSelector = document.getElementById('gameModeSelector');
    if (modeSelector) modeSelector.style.display = 'none';

    // Fetch opponent profile
    const oppId = gameState.myColor === 'white' ? game.player_black : game.player_white;
    const { data: opp } = await sb.from('users').select('username').eq('id', oppId).single();
    gameState.opponentProfile = opp;

    // Load board from DB state or initialize fresh
    if (game.board_state && game.board_state.board) {
        Object.assign(gameState, game.board_state);
        gameState.isOnlineGame = true;
        gameState.myColor = game.player_white === gameUser.id ? 'white' : 'black';
        gameState.onlineGameId = gameId;
    } else {
        initializeBoard();
        gameState.currentTurn = 'white';
        gameState.gameStatus = 'active';
    }

    // Render board (flip if playing black)
    const flipped = gameState.myColor === 'black';
    renderBoard(flipped);
    updateOnlinePlayerPanels();
    updateMoveHistory();

    // Subscribe to moves
    subscribeToMoves(gameId);
    subscribeToGameUpdates(gameId);

    // Handle finished game
    if (game.status === 'finished') {
        handleGameOver(game);
    }

    // Disable reset in online mode
    document.getElementById('resetBtn')?.setAttribute('disabled', 'true');

    // Online resign button
    document.getElementById('resignBtn')?.addEventListener('click', () => resign());
}

function updateOnlinePlayerPanels() {
    const myName = gameProfile.username;
    const oppName = gameState.opponentProfile?.username || 'Opponent';
    const myColor = gameState.myColor;
    const oppColor = myColor === 'white' ? 'black' : 'white';

    const whitePanel = document.getElementById('whitePanel');
    const blackPanel = document.getElementById('blackPanel');

    if (whitePanel) {
        whitePanel.querySelector('.pp-name').textContent = myColor === 'white' ? myName : oppName;
        whitePanel.querySelector('.pp-label').textContent = myColor === 'white' ? 'You' : 'Opponent';
    }
    if (blackPanel) {
        blackPanel.querySelector('.pp-name').textContent = myColor === 'black' ? myName : oppName;
        blackPanel.querySelector('.pp-label').textContent = myColor === 'black' ? 'You' : 'Opponent';
    }

    refreshActivePlayerHighlight();
}

function updatePlayerPanels(whiteName, blackName, status) {
    const whitePanel = document.getElementById('whitePanel');
    const blackPanel = document.getElementById('blackPanel');
    if (whitePanel) whitePanel.querySelector('.pp-name').textContent = whiteName || 'White';
    if (blackPanel) blackPanel.querySelector('.pp-name').textContent = blackName || 'Black';
    refreshActivePlayerHighlight();
}

function refreshActivePlayerHighlight() {
    document.getElementById('whitePanel')?.classList.toggle('active-player', gameState.currentTurn === 'white');
    document.getElementById('blackPanel')?.classList.toggle('active-player', gameState.currentTurn === 'black');
    const wBadge = document.getElementById('whiteTurnBadge');
    const bBadge = document.getElementById('blackTurnBadge');
    if (wBadge) wBadge.style.display = gameState.currentTurn === 'white' ? 'inline-flex' : 'none';
    if (bBadge) bBadge.style.display = gameState.currentTurn === 'black' ? 'inline-flex' : 'none';
}

// ===== REALTIME – SUBSCRIBE TO MOVES =====
function subscribeToMoves(gameId) {
    if (movesChannel) movesChannel.unsubscribe();

    movesChannel = sb
        .channel(`moves:${gameId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'moves',
            filter: `game_id=eq.${gameId}`
        }, (payload) => {
            const moveRow = payload.new;
            // Ignore our own moves (we already applied them locally)
            if (moveRow.player_id === gameUser.id) return;
            applyOpponentMove(moveRow.move_data);
        })
        .subscribe();
}

// ===== REALTIME – SUBSCRIBE TO GAME STATUS =====
function subscribeToGameUpdates(gameId) {
    if (gameChannel) gameChannel.unsubscribe();

    gameChannel = sb
        .channel(`game_status:${gameId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`
        }, (payload) => {
            const updatedGame = payload.new;
            if (updatedGame.status === 'finished') {
                handleGameOver(updatedGame);
            }
        })
        .subscribe();
}

// ===== APPLY OPPONENT MOVE =====
function applyOpponentMove(moveData) {
    const { fromRow, fromCol, toRow, toCol, promotion } = moveData;

    // Set correct legal moves for the piece being moved
    gameState.selectedSquare = [fromRow, fromCol];
    gameState.legalMoves = getLegalMoves(fromRow, fromCol);

    makeMove(fromRow, fromCol, toRow, toCol, promotion || null);
    clearSelection();

    // Check if game ended
    if (gameState.gameStatus === 'checkmate' || gameState.gameStatus === 'stalemate') {
        concludeOnlineGame();
    }

    refreshActivePlayerHighlight();
}

// ===== SEND MOVE TO SERVER =====
async function sendMoveToServer(fromRow, fromCol, toRow, toCol, promotion = null) {
    if (!gameState.isOnlineGame) return;

    const moveData = { fromRow, fromCol, toRow, toCol, promotion };

    try {
        // Insert move
        await sb.from('moves').insert({
            game_id: gameState.onlineGameId,
            player_id: gameUser.id,
            move_data: moveData
        });

        // Update game board_state and current_turn
        const boardSnapshot = {
            board: gameState.board,
            currentTurn: gameState.currentTurn,
            gameStatus: gameState.gameStatus,
            enPassantTarget: gameState.enPassantTarget,
            castlingRights: gameState.castlingRights,
            kingMoved: gameState.kingMoved,
            rookMoved: gameState.rookMoved,
            moveHistory: gameState.moveHistory
        };

        await sb.from('games').update({
            board_state: boardSnapshot,
            current_turn: gameState.currentTurn
        }).eq('id', gameState.onlineGameId);

        // If game ended, update status
        if (gameState.gameStatus === 'checkmate' || gameState.gameStatus === 'stalemate') {
            await concludeOnlineGame();
        }

        refreshActivePlayerHighlight();
    } catch (e) {
        console.error('Failed to send move:', e);
        Notifications.showToast({ type: 'error', title: 'Move failed', message: 'Network error. Please check your connection.' });
    }
}

// Override makeMove to intercept online sends
const originalMakeMove = makeMove;
window._originalMakeMove = originalMakeMove;

// Patch: after a local move in online game, send to server
// We hook into finalizeMoveShared by monkey-patching it
const _originalFinalize = window.finalizeMoveShared || finalizeMoveShared;
window.finalizeMoveShared_online = function (fromRow, fromCol, toRow, toCol, piece, capturedPiece) {
    _originalFinalize(fromRow, fromCol, toRow, toCol, piece, capturedPiece);
    if (gameState.isOnlineGame && piece.color === gameState.myColor) {
        // The turn was just switched; detect promotion
        const promotedPiece = gameState.board[toRow][toCol];
        const wasPromo = piece.type === 'pawn' && promotedPiece && promotedPiece.type !== 'pawn';
        sendMoveToServer(fromRow, fromCol, toRow, toCol, wasPromo ? promotedPiece.type : null);
    }
    refreshActivePlayerHighlight();
};

// ===== CONCLUDE GAME =====
async function concludeOnlineGame() {
    let winner = null;
    if (gameState.gameStatus === 'checkmate') {
        winner = gameState.currentTurn === 'white' ? 'black' : 'white';
    } else {
        winner = 'draw';
    }

    try {
        await sb.from('games').update({
            status: 'finished',
            winner: winner === 'draw' ? null : winner
        }).eq('id', gameState.onlineGameId);
    } catch (e) { console.error('Error concluding game:', e); }
}

function handleGameOver(game) {
    const winner = game.winner;
    let msg, type;
    if (!winner || winner === 'draw') {
        msg = "It's a Draw! 🤝"; type = 'info';
    } else {
        const iWon = (winner === gameState.myColor);
        msg = iWon ? '🏆 You Win!' : '💀 You Lost!';
        type = iWon ? 'success' : 'error';
    }
    Notifications.showToast({ type, title: msg, message: 'Game Over!', duration: 0 });
    // Show overlay
    const overlay = document.getElementById('gameOverOverlay');
    if (overlay) {
        overlay.querySelector('.result-text').textContent = msg;
        overlay.classList.add('active');
    }
}

// ===== RESIGN =====
async function resign() {
    if (!gameState.isOnlineGame) return;
    if (!confirm('Are you sure you want to resign?')) return;
    const winner = gameState.myColor === 'white' ? 'black' : 'white';
    await sb.from('games').update({ status: 'finished', winner }).eq('id', gameState.onlineGameId);
    handleGameOver({ winner });
}

// ===== VIEW MODE (read-only game replay) =====
async function initViewMode(gameId) {
    const { data: game } = await sb.from('games').select('*').eq('id', gameId).single();
    if (!game) return;

    gameState.isOnlineGame = false;
    if (game.board_state && game.board_state.board) {
        loadBoardState(game.board_state.board);
        gameState.moveHistory = game.board_state.moveHistory || [];
    } else {
        initializeBoard();
    }

    renderBoard(false);
    updateMoveHistory();

    // Disable clicks in view mode
    document.getElementById('chessboard')?.querySelectorAll('.square').forEach(sq => {
        sq.style.pointerEvents = 'none';
    });

    showGameAlert('Viewing completed game (read-only)', 'info');
}

// ===== LOADER =====
function hideLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) { loader.classList.add('hidden'); setTimeout(() => loader.remove(), 500); }
}

// ===== EXPOSE =====
window.OnlineGame = { initGame, sendMoveToServer, resign };

// Hook finalizeMoveShared so online moves get sent to server
window.finalizeMoveShared = window.finalizeMoveShared_online;
