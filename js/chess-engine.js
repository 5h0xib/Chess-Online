// ===== CHESS ENGINE =====
// Extracted from Chess-Game by 5h0xib (https://github.com/5h0xib/Chess-Game)
// Full engine: move generation, AI (minimax + alpha-beta), check/checkmate/stalemate

// Unicode chess pieces
const PIECES = {
    white: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

let gameState = {
    board: [],
    currentTurn: 'white',
    selectedSquare: null,
    legalMoves: [],
    gameStatus: 'active',
    moveHistory: [],
    enPassantTarget: null,
    castlingRights: {
        white: { kingSide: true, queenSide: true },
        black: { kingSide: true, queenSide: true }
    },
    kingMoved: { white: false, black: false },
    rookMoved: {
        white: { kingSide: false, queenSide: false },
        black: { kingSide: false, queenSide: false }
    },
    gameMode: 'pvp',
    aiDifficulty: 'medium',
    isAiThinking: false,
    // Online game fields
    onlineGameId: null,
    myColor: null,
    opponentProfile: null,
    isOnlineGame: false,
    pendingPromotion: null
};

// ===== INITIALIZE BOARD =====
function initializeBoard() {
    gameState.board = Array(8).fill(null).map(() => Array(8).fill(null));
    const backRow = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (let col = 0; col < 8; col++) {
        gameState.board[0][col] = { type: backRow[col], color: 'black' };
        gameState.board[1][col] = { type: 'pawn', color: 'black' };
        gameState.board[6][col] = { type: 'pawn', color: 'white' };
        gameState.board[7][col] = { type: backRow[col], color: 'white' };
    }
}

// ===== LOAD BOARD FROM FEN-LIKE STATE =====
function loadBoardState(boardArray) {
    gameState.board = boardArray.map(row => row.map(cell => cell ? { ...cell } : null));
}

// ===== RENDER BOARD =====
function renderBoard(flipped = false) {
    const chessboard = document.getElementById('chessboard');
    if (!chessboard) return;
    chessboard.innerHTML = '';

    const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (const row of rows) {
        for (const col of cols) {
            const square = document.createElement('div');
            square.className = 'square';
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = row;
            square.dataset.col = col;

            const piece = gameState.board[row][col];
            if (piece) {
                const pieceSpan = document.createElement('span');
                pieceSpan.className = `piece ${piece.color}-piece`;
                pieceSpan.textContent = PIECES[piece.color][piece.type];
                square.appendChild(pieceSpan);
            }

            square.addEventListener('click', () => handleSquareClick(row, col));
            chessboard.appendChild(square);
        }
    }
    updateGameStatusDisplay();
}

// ===== HANDLE SQUARE CLICK =====
function handleSquareClick(row, col) {
    if (gameState.gameStatus === 'checkmate' || gameState.gameStatus === 'stalemate') return;
    if (gameState.isAiThinking) return;
    if (gameState.pendingPromotion) return;

    // Online game: only allow moves on your turn and your color
    if (gameState.isOnlineGame) {
        if (gameState.currentTurn !== gameState.myColor) return;
    } else {
        // AI mode: prevent moving black pieces
        if (gameState.gameMode === 'pvc' && gameState.currentTurn === 'black') return;
    }

    const clickedPiece = gameState.board[row][col];

    if (gameState.selectedSquare !== null) {
        const [selectedRow, selectedCol] = gameState.selectedSquare;
        const isLegalMove = gameState.legalMoves.some(m => m.row === row && m.col === col);

        if (isLegalMove) {
            makeMove(selectedRow, selectedCol, row, col);
            clearSelection();
            return;
        }
        if ((selectedRow === row && selectedCol === col) || !clickedPiece) {
            clearSelection();
            return;
        }
        if (clickedPiece && clickedPiece.color === gameState.currentTurn) {
            selectSquare(row, col);
            return;
        }
        clearSelection();
    } else {
        if (clickedPiece && clickedPiece.color === gameState.currentTurn) {
            selectSquare(row, col);
        }
    }
}

function selectSquare(row, col) {
    gameState.selectedSquare = [row, col];
    gameState.legalMoves = getLegalMoves(row, col);
    highlightSquares();
}
function clearSelection() {
    gameState.selectedSquare = null;
    gameState.legalMoves = [];
    removeHighlights();
}
function highlightSquares() {
    removeHighlights();
    if (gameState.selectedSquare) {
        const [row, col] = gameState.selectedSquare;
        const sq = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (sq) sq.classList.add('selected');
        gameState.legalMoves.forEach(move => {
            const msq = document.querySelector(`[data-row="${move.row}"][data-col="${move.col}"]`);
            if (!msq) return;
            if (gameState.board[move.row][move.col]) {
                msq.classList.add('legal-capture');
            } else {
                msq.classList.add('legal-move');
            }
        });
    }
}
function removeHighlights() {
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('selected', 'legal-move', 'legal-capture');
    });
}

// ===== HIGHLIGHT LAST MOVE =====
function highlightLastMove(fromRow, fromCol, toRow, toCol) {
    document.querySelectorAll('.square.last-move').forEach(sq => sq.classList.remove('last-move'));
    const from = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
    const to = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
    if (from) from.classList.add('last-move');
    if (to) to.classList.add('last-move');
}

// ===== GET LEGAL MOVES =====
function getLegalMoves(row, col) {
    const piece = gameState.board[row][col];
    if (!piece) return [];
    let moves = [];
    switch (piece.type) {
        case 'pawn': moves = getPawnMoves(row, col, piece.color); break;
        case 'rook': moves = getRookMoves(row, col, piece.color); break;
        case 'knight': moves = getKnightMoves(row, col, piece.color); break;
        case 'bishop': moves = getBishopMoves(row, col, piece.color); break;
        case 'queen': moves = getQueenMoves(row, col, piece.color); break;
        case 'king': moves = getKingMoves(row, col, piece.color); break;
    }
    return moves.filter(move => !wouldBeInCheck(row, col, move.row, move.col, piece.color));
}

function getPawnMoves(row, col, color) {
    const moves = [];
    const dir = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    if (isValidSquare(row + dir, col) && !gameState.board[row + dir][col]) {
        moves.push({ row: row + dir, col });
        if (row === startRow && !gameState.board[row + 2 * dir][col]) {
            moves.push({ row: row + 2 * dir, col });
        }
    }
    [-1, 1].forEach(offset => {
        const nr = row + dir, nc = col + offset;
        if (isValidSquare(nr, nc)) {
            const target = gameState.board[nr][nc];
            if (target && target.color !== color) moves.push({ row: nr, col: nc });
            if (gameState.enPassantTarget &&
                gameState.enPassantTarget.row === nr &&
                gameState.enPassantTarget.col === nc) {
                moves.push({ row: nr, col: nc, enPassant: true });
            }
        }
    });
    return moves;
}
function getRookMoves(row, col, color) {
    const moves = [];
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (!isValidSquare(nr, nc)) break;
            const t = gameState.board[nr][nc];
            if (!t) { moves.push({ row: nr, col: nc }); }
            else { if (t.color !== color) moves.push({ row: nr, col: nc }); break; }
        }
    });
    return moves;
}
function getKnightMoves(row, col, color) {
    const moves = [];
    [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        if (isValidSquare(nr, nc)) {
            const t = gameState.board[nr][nc];
            if (!t || t.color !== color) moves.push({ row: nr, col: nc });
        }
    });
    return moves;
}
function getBishopMoves(row, col, color) {
    const moves = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (!isValidSquare(nr, nc)) break;
            const t = gameState.board[nr][nc];
            if (!t) { moves.push({ row: nr, col: nc }); }
            else { if (t.color !== color) moves.push({ row: nr, col: nc }); break; }
        }
    });
    return moves;
}
function getQueenMoves(row, col, color) {
    return [...getRookMoves(row, col, color), ...getBishopMoves(row, col, color)];
}
function getKingMoves(row, col, color) {
    const moves = [];
    [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        if (isValidSquare(nr, nc)) {
            const t = gameState.board[nr][nc];
            if (!t || t.color !== color) moves.push({ row: nr, col: nc });
        }
    });
    moves.push(...getCastlingMoves(row, col, color));
    return moves;
}
function getCastlingMoves(row, col, color) {
    const moves = [];
    if (gameState.kingMoved[color]) return moves;
    if (isKingInCheck(color)) return moves;
    const backRank = color === 'white' ? 7 : 0;
    if (gameState.castlingRights[color].kingSide && !gameState.rookMoved[color].kingSide) {
        if (!gameState.board[backRank][5] && !gameState.board[backRank][6] &&
            !isSquareUnderAttack(backRank, 5, color) && !isSquareUnderAttack(backRank, 6, color)) {
            moves.push({ row: backRank, col: 6, castling: 'king-side' });
        }
    }
    if (gameState.castlingRights[color].queenSide && !gameState.rookMoved[color].queenSide) {
        if (!gameState.board[backRank][1] && !gameState.board[backRank][2] && !gameState.board[backRank][3] &&
            !isSquareUnderAttack(backRank, 2, color) && !isSquareUnderAttack(backRank, 3, color)) {
            moves.push({ row: backRank, col: 2, castling: 'queen-side' });
        }
    }
    return moves;
}

// ===== MAKE MOVE =====
function makeMove(fromRow, fromCol, toRow, toCol, promotionPiece = null) {
    const piece = gameState.board[fromRow][fromCol];
    const capturedPiece = gameState.board[toRow][toCol];
    const move = gameState.legalMoves.find(m => m.row === toRow && m.col === toCol);

    // En passant
    if (move && move.enPassant) {
        const captureRow = piece.color === 'white' ? toRow + 1 : toRow - 1;
        gameState.board[captureRow][toCol] = null;
    }
    // Castling
    if (move && move.castling) {
        const backRank = piece.color === 'white' ? 7 : 0;
        if (move.castling === 'king-side') {
            gameState.board[backRank][5] = gameState.board[backRank][7];
            gameState.board[backRank][7] = null;
        } else {
            gameState.board[backRank][3] = gameState.board[backRank][0];
            gameState.board[backRank][0] = null;
        }
    }

    gameState.board[toRow][toCol] = piece;
    gameState.board[fromRow][fromCol] = null;

    // En passant target
    gameState.enPassantTarget = null;
    if (piece.type === 'pawn' && Math.abs(toRow - fromRow) === 2) {
        gameState.enPassantTarget = { row: (fromRow + toRow) / 2, col: toCol };
    }
    // Track king/rook movement
    if (piece.type === 'king') gameState.kingMoved[piece.color] = true;
    if (piece.type === 'rook') {
        const backRank = piece.color === 'white' ? 7 : 0;
        if (fromRow === backRank) {
            if (fromCol === 0) gameState.rookMoved[piece.color].queenSide = true;
            if (fromCol === 7) gameState.rookMoved[piece.color].kingSide = true;
        }
    }

    // Pawn promotion
    if (piece.type === 'pawn') {
        const promotionRow = piece.color === 'white' ? 0 : 7;
        if (toRow === promotionRow) {
            if (promotionPiece) {
                gameState.board[toRow][toCol] = { type: promotionPiece, color: piece.color };
            } else {
                // Show promotion UI before finalizing
                gameState.board[toRow][toCol] = piece; // temp
                gameState.pendingPromotion = { row: toRow, col: toCol, color: piece.color };
                showPromotionModal(piece.color, toRow, toCol, fromRow, fromCol);
                return; // Don't switch turn yet
            }
        }
    }

    finalizeMoveShared(fromRow, fromCol, toRow, toCol, piece, capturedPiece);
}

// Called after promotion choice OR directly
function finalizeMoveShared(fromRow, fromCol, toRow, toCol, piece, capturedPiece) {
    gameState.moveHistory.push({
        from: { row: fromRow, col: fromCol },
        to: { row: toRow, col: toCol },
        piece, captured: capturedPiece
    });

    gameState.currentTurn = gameState.currentTurn === 'white' ? 'black' : 'white';
    checkGameStatus();
    highlightLastMove(fromRow, fromCol, toRow, toCol);

    if (!gameState.isOnlineGame) {
        saveGameState();
    }

    renderBoard(gameState.isOnlineGame && gameState.myColor === 'black');
    updateMoveHistory();

    if (!gameState.isOnlineGame && gameState.gameMode === 'pvc' &&
        gameState.currentTurn === 'black' &&
        (gameState.gameStatus === 'active' || gameState.gameStatus === 'check')) {
        setTimeout(makeComputerMove, 500);
    }
}

// ===== PROMOTION MODAL =====
function showPromotionModal(color, toRow, toCol, fromRow, fromCol) {
    let modal = document.getElementById('promotionModal');
    if (!modal) return;
    const opts = modal.querySelector('.promotion-options');
    opts.innerHTML = '';
    ['queen', 'rook', 'bishop', 'knight'].forEach(type => {
        const btn = document.createElement('button');
        btn.className = 'promo-piece';
        btn.innerHTML = `<span class="promo-icon">${PIECES[color][type]}</span><span>${type}</span>`;
        btn.onclick = () => {
            gameState.board[toRow][toCol] = { type, color };
            gameState.pendingPromotion = null;
            closePromotionModal();
            const old = gameState.moveHistory[gameState.moveHistory.length - 1];
            const captured = old ? old.captured : null;
            finalizeMoveShared(fromRow, fromCol, toRow, toCol, { type: 'pawn', color }, captured);

            // If online, send the move with promotion info
            if (gameState.isOnlineGame && window.OnlineGame) {
                window.OnlineGame.sendMoveToServer(fromRow, fromCol, toRow, toCol, type);
            }
        };
        opts.appendChild(btn);
    });
    modal.parentElement.classList.add('active');
}
function closePromotionModal() {
    const modal = document.getElementById('promotionModal');
    if (modal) modal.parentElement.classList.remove('active');
}

// ===== WOULD BE IN CHECK =====
function wouldBeInCheck(fromRow, fromCol, toRow, toCol, color) {
    const tempBoard = gameState.board.map(row => [...row]);
    tempBoard[toRow][toCol] = tempBoard[fromRow][fromCol];
    tempBoard[fromRow][fromCol] = null;
    let kingRow, kingCol;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = tempBoard[r][c];
            if (p && p.type === 'king' && p.color === color) { kingRow = r; kingCol = c; break; }
        }
        if (kingRow !== undefined) break;
    }
    return isSquareUnderAttackTemp(kingRow, kingCol, color, tempBoard);
}
function isSquareUnderAttack(row, col, defenderColor) {
    return isSquareUnderAttackTemp(row, col, defenderColor, gameState.board);
}
function isSquareUnderAttackTemp(row, col, defenderColor, board) {
    const attackerColor = defenderColor === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === attackerColor) {
                const attacks = getAttackSquares(r, c, piece, board);
                if (attacks.some(sq => sq.row === row && sq.col === col)) return true;
            }
        }
    }
    return false;
}
function getAttackSquares(row, col, piece, board) {
    const moves = [];
    switch (piece.type) {
        case 'pawn': {
            const dir = piece.color === 'white' ? -1 : 1;
            [-1, 1].forEach(offset => {
                const nr = row + dir, nc = col + offset;
                if (isValidSquare(nr, nc)) moves.push({ row: nr, col: nc });
            });
            break;
        }
        case 'rook': moves.push(...getRookMovesTemp(row, col, piece.color, board)); break;
        case 'knight': moves.push(...getKnightMovesTemp(row, col, piece.color, board)); break;
        case 'bishop': moves.push(...getBishopMovesTemp(row, col, piece.color, board)); break;
        case 'queen':
            moves.push(...getRookMovesTemp(row, col, piece.color, board));
            moves.push(...getBishopMovesTemp(row, col, piece.color, board));
            break;
        case 'king':
            [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => {
                const nr = row + dr, nc = col + dc;
                if (isValidSquare(nr, nc)) moves.push({ row: nr, col: nc });
            });
            break;
    }
    return moves;
}

function getRookMovesTemp(row, col, color, board) {
    const moves = [];
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (!isValidSquare(nr, nc)) break;
            const t = board[nr][nc];
            if (!t) moves.push({ row: nr, col: nc });
            else { if (t.color !== color) moves.push({ row: nr, col: nc }); break; }
        }
    });
    return moves;
}
function getBishopMovesTemp(row, col, color, board) {
    const moves = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dr, dc]) => {
        for (let i = 1; i < 8; i++) {
            const nr = row + dr * i, nc = col + dc * i;
            if (!isValidSquare(nr, nc)) break;
            const t = board[nr][nc];
            if (!t) moves.push({ row: nr, col: nc });
            else { if (t.color !== color) moves.push({ row: nr, col: nc }); break; }
        }
    });
    return moves;
}
function getKnightMovesTemp(row, col, color, board) {
    const moves = [];
    [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        if (isValidSquare(nr, nc)) {
            const t = board[nr][nc];
            if (!t || t.color !== color) moves.push({ row: nr, col: nc });
        }
    });
    return moves;
}
function isKingInCheck(color) {
    let kingRow, kingCol;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = gameState.board[r][c];
            if (p && p.type === 'king' && p.color === color) { kingRow = r; kingCol = c; break; }
        }
        if (kingRow !== undefined) break;
    }
    return isSquareUnderAttack(kingRow, kingCol, color);
}
function checkGameStatus() {
    const color = gameState.currentTurn;
    const inCheck = isKingInCheck(color);
    const hasLegal = playerHasLegalMoves(color);
    if (inCheck) {
        if (!hasLegal) {
            gameState.gameStatus = 'checkmate';
            const winner = color === 'white' ? 'Black' : 'White';
            showGameAlert(`Checkmate! ${winner} wins!`, 'checkmate');
        } else {
            gameState.gameStatus = 'check';
            showGameAlert(`${color.charAt(0).toUpperCase() + color.slice(1)} is in check!`, 'check');
            highlightCheckedKing(color);
        }
    } else {
        if (!hasLegal) {
            gameState.gameStatus = 'stalemate';
            showGameAlert('Stalemate! Game is a draw.', 'stalemate');
        } else {
            gameState.gameStatus = 'active';
            clearGameAlerts();
        }
    }
}
function highlightCheckedKing(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = gameState.board[r][c];
            if (p && p.type === 'king' && p.color === color) {
                const sq = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                if (sq) sq.classList.add('check-king');
                return;
            }
        }
    }
}
function playerHasLegalMoves(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = gameState.board[r][c];
            if (p && p.color === color && getLegalMoves(r, c).length > 0) return true;
        }
    }
    return false;
}
function updateGameStatusDisplay() {
    const sd = document.getElementById('gameStatus');
    const ct = document.getElementById('currentTurn');
    if (!sd || !ct) return;
    ct.textContent = gameState.currentTurn.charAt(0).toUpperCase() + gameState.currentTurn.slice(1);
    sd.className = 'game-status-display';
    sd.classList.add(gameState.currentTurn === `white` ? 'white-turn' : 'black-turn');
    if (gameState.gameStatus === 'check') sd.classList.add('check');
    if (gameState.gameStatus === 'checkmate') sd.classList.add('checkmate');
    if (gameState.gameStatus === 'stalemate') sd.classList.add('stalemate');
}
function showGameAlert(msg, type) {
    const el = document.getElementById('gameAlerts');
    if (el) el.innerHTML = `<div class="alert ${type}">${msg}</div>`;
}
function clearGameAlerts() {
    const el = document.getElementById('gameAlerts');
    if (el) el.innerHTML = '';
}
function isValidSquare(row, col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }

// ===== MOVE HISTORY DISPLAY =====
function updateMoveHistory() {
    const list = document.getElementById('moveHistoryList');
    if (!list) return;
    list.innerHTML = '';
    const history = gameState.moveHistory;
    for (let i = 0; i < history.length; i += 2) {
        const div = document.createElement('div');
        div.className = 'move-pair';
        const num = document.createElement('span');
        num.className = 'move-num'; num.textContent = (i / 2 + 1) + '.';
        const wMove = document.createElement('span');
        wMove.className = 'move-cell white-move';
        wMove.textContent = formatMove(history[i]);
        div.appendChild(num); div.appendChild(wMove);
        if (history[i + 1]) {
            const bMove = document.createElement('span');
            bMove.className = 'move-cell black-move';
            bMove.textContent = formatMove(history[i + 1]);
            div.appendChild(bMove);
        }
        list.appendChild(div);
    }
    list.scrollTop = list.scrollHeight;
}
function formatMove(m) {
    if (!m) return '';
    const cols = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const rows = ['8', '7', '6', '5', '4', '3', '2', '1'];
    return `${cols[m.from.col]}${rows[m.from.row]}–${cols[m.to.col]}${rows[m.to.row]}`;
}

// ===== LOCAL STORAGE =====
const STORAGE_KEY = 'chessOnlineLocalGame';
function saveGameState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            board: gameState.board, currentTurn: gameState.currentTurn,
            gameStatus: gameState.gameStatus, moveHistory: gameState.moveHistory,
            enPassantTarget: gameState.enPassantTarget, castlingRights: gameState.castlingRights,
            kingMoved: gameState.kingMoved, rookMoved: gameState.rookMoved,
            gameMode: gameState.gameMode, aiDifficulty: gameState.aiDifficulty
        }));
    } catch (e) { }
}
function loadGameState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return false;
        const p = JSON.parse(saved);
        Object.assign(gameState, p);
        return true;
    } catch (e) { return false; }
}

// ===== RESET =====
function resetGame() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { }
    const mode = gameState.gameMode, diff = gameState.aiDifficulty;
    gameState = {
        board: [], currentTurn: 'white', selectedSquare: null, legalMoves: [],
        gameStatus: 'active', moveHistory: [], enPassantTarget: null,
        castlingRights: { white: { kingSide: true, queenSide: true }, black: { kingSide: true, queenSide: true } },
        kingMoved: { white: false, black: false },
        rookMoved: { white: { kingSide: false, queenSide: false }, black: { kingSide: false, queenSide: false } },
        gameMode: mode, aiDifficulty: diff, isAiThinking: false,
        onlineGameId: null, myColor: null, isOnlineGame: false, pendingPromotion: null
    };
    initializeBoard(); renderBoard(); clearGameAlerts(); updateMoveHistory();
}

// ===== AI ENGINE =====
const PIECE_VALUES = { pawn: 100, knight: 320, bishop: 330, rook: 500, queen: 900, king: 20000 };
const PIECE_SQUARE_TABLES = {
    pawn: [[0, 0, 0, 0, 0, 0, 0, 0], [50, 50, 50, 50, 50, 50, 50, 50], [10, 10, 20, 30, 30, 20, 10, 10], [5, 5, 10, 25, 25, 10, 5, 5], [0, 0, 0, 20, 20, 0, 0, 0], [5, -5, -10, 0, 0, -10, -5, 5], [5, 10, 10, -20, -20, 10, 10, 5], [0, 0, 0, 0, 0, 0, 0, 0]],
    knight: [[-50, -40, -30, -30, -30, -30, -40, -50], [-40, -20, 0, 0, 0, 0, -20, -40], [-30, 0, 10, 15, 15, 10, 0, -30], [-30, 5, 15, 20, 20, 15, 5, -30], [-30, 0, 15, 20, 20, 15, 0, -30], [-30, 5, 10, 15, 15, 10, 5, -30], [-40, -20, 0, 5, 5, 0, -20, -40], [-50, -40, -30, -30, -30, -30, -40, -50]],
    bishop: [[-20, -10, -10, -10, -10, -10, -10, -20], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 0, 5, 10, 10, 5, 0, -10], [-10, 5, 5, 10, 10, 5, 5, -10], [-10, 0, 10, 10, 10, 10, 0, -10], [-10, 10, 10, 10, 10, 10, 10, -10], [-10, 5, 0, 0, 0, 0, 5, -10], [-20, -10, -10, -10, -10, -10, -10, -20]],
    rook: [[0, 0, 0, 0, 0, 0, 0, 0], [5, 10, 10, 10, 10, 10, 10, 5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [0, 0, 0, 5, 5, 0, 0, 0]],
    queen: [[-20, -10, -10, -5, -5, -10, -10, -20], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 0, 5, 5, 5, 5, 0, -10], [-5, 0, 5, 5, 5, 5, 0, -5], [0, 0, 5, 5, 5, 5, 0, -5], [-10, 5, 5, 5, 5, 5, 0, -10], [-10, 0, 5, 0, 0, 0, 0, -10], [-20, -10, -10, -5, -5, -10, -10, -20]],
    king: [[-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-20, -30, -30, -40, -40, -30, -30, -20], [-10, -20, -20, -20, -20, -20, -20, -10], [20, 20, 0, 0, 0, 0, 20, 20], [20, 30, 10, 0, 0, 10, 30, 20]]
};
const KING_ENDGAME_TABLE = [[-50, -30, -30, -30, -30, -30, -30, -50], [-30, -30, 0, 0, 0, 0, -30, -30], [-30, -10, 20, 30, 30, 20, -10, -30], [-30, -10, 30, 40, 40, 30, -10, -30], [-30, -10, 30, 40, 40, 30, -10, -30], [-30, -10, 20, 30, 30, 20, -10, -30], [-30, -20, -10, 0, 0, -10, -20, -30], [-50, -40, -30, -20, -20, -30, -40, -50]];

function isEndgame(board) {
    let queens = 0, total = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = board[r][c]; if (!p || p.type === 'king') continue;
        if (p.type === 'queen') queens++; total += PIECE_VALUES[p.type];
    }
    return queens === 0 || total < 1600;
}
function evaluatePosition(board, color) {
    let score = 0, endgame = isEndgame(board);
    let aiKr = -1, aiKc = -1, enKr = -1, enKc = -1;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = board[r][c]; if (!p) continue;
        if (p.type === 'king') {
            if (p.color === color) { aiKr = r; aiKc = c; } else { enKr = r; enKc = c; }
        }
        let val = PIECE_VALUES[p.type];
        let pos = 0;
        if (p.type === 'king' && endgame) {
            const tr = p.color === 'white' ? 7 - r : r;
            pos = p.color === color ? KING_ENDGAME_TABLE[tr][c] : -KING_ENDGAME_TABLE[tr][c];
        } else {
            const tr = p.color === 'white' ? 7 - r : r;
            pos = PIECE_SQUARE_TABLES[p.type][tr][c];
        }
        score += p.color === color ? (val + pos) : -(val + pos);
    }
    if (endgame && aiKr !== -1 && enKr !== -1) {
        score += Math.max(Math.abs(3.5 - enKr), Math.abs(3.5 - enKc)) * 15;
        score += (14 - Math.abs(aiKr - enKr) - Math.abs(aiKc - enKc)) * 5;
    }
    return score;
}
function orderMoves(moves, board) {
    return moves.sort((a, b) => {
        const va = board[a.to.row][a.to.col], vb = board[b.to.row][b.to.col];
        const aa = board[a.from.row][a.from.col], ab = board[b.from.row][b.from.col];
        const sa = va ? (PIECE_VALUES[va.type] * 10) - (aa ? PIECE_VALUES[aa.type] : 0) : 0;
        const sb = vb ? (PIECE_VALUES[vb.type] * 10) - (ab ? PIECE_VALUES[ab.type] : 0) : 0;
        return sb - sa;
    });
}
function getAllPossibleMoves(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (p && p.color === color) {
            const orig = gameState.board; gameState.board = board;
            const pm = getLegalMoves(r, c); gameState.board = orig;
            pm.forEach(m => moves.push({ from: { row: r, col: c }, to: { row: m.row, col: m.col } }));
        }
    }
    return moves;
}
function makeMoveOnBoard(board, fr, fc, tr, tc) {
    const nb = board.map(r => [...r]);
    nb[tr][tc] = nb[fr][fc]; nb[fr][fc] = null;
    return nb;
}
function minimax(board, depth, alpha, beta, isMax, aiColor) {
    const color = isMax ? aiColor : (aiColor === 'black' ? 'white' : 'black');
    const moves = getAllPossibleMoves(board, color);
    if (moves.length === 0) {
        const origB = gameState.board; gameState.board = board;
        const inChk = isKingInCheck(color); gameState.board = origB;
        return inChk ? (isMax ? -100000 - depth * 100 : 100000 + depth * 100) : 0;
    }
    if (depth === 0) return evaluatePosition(board, aiColor);
    const ordered = orderMoves(moves, board);
    if (isMax) {
        let mx = -Infinity;
        for (const m of ordered) {
            const nb = makeMoveOnBoard(board, m.from.row, m.from.col, m.to.row, m.to.col);
            mx = Math.max(mx, minimax(nb, depth - 1, alpha, beta, false, aiColor));
            alpha = Math.max(alpha, mx); if (beta <= alpha) break;
        }
        return mx;
    } else {
        let mn = Infinity;
        for (const m of ordered) {
            const nb = makeMoveOnBoard(board, m.from.row, m.from.col, m.to.row, m.to.col);
            mn = Math.min(mn, minimax(nb, depth - 1, alpha, beta, true, aiColor));
            beta = Math.min(beta, mn); if (beta <= alpha) break;
        }
        return mn;
    }
}
function getBestMove() {
    const aiColor = 'black';
    const moves = getAllPossibleMoves(gameState.board, aiColor);
    if (!moves.length) return null;
    let depth; switch (gameState.aiDifficulty) { case 'easy': depth = 2; break; case 'hard': depth = 4; break; default: depth = 3; }
    const lastMove = gameState.moveHistory.length >= 2 ? gameState.moveHistory[gameState.moveHistory.length - 2] : null;
    const ordered = orderMoves(moves, gameState.board);
    let best = null, bestVal = -Infinity;
    for (const m of ordered) {
        const nb = makeMoveOnBoard(gameState.board, m.from.row, m.from.col, m.to.row, m.to.col);
        let val = minimax(nb, depth - 1, -Infinity, Infinity, false, aiColor);
        if (lastMove && m.from.row === lastMove.to.row && m.from.col === lastMove.to.col &&
            m.to.row === lastMove.from.row && m.to.col === lastMove.from.col) val -= 300;
        if (val > bestVal) { bestVal = val; best = m; }
    }
    return best;
}
function makeComputerMove() {
    gameState.isAiThinking = true;
    showGameAlert('AI is thinking...', 'ai-thinking');
    setTimeout(() => {
        const bm = getBestMove();
        if (bm) {
            gameState.selectedSquare = [bm.from.row, bm.from.col];
            gameState.legalMoves = getLegalMoves(bm.from.row, bm.from.col);
            makeMove(bm.from.row, bm.from.col, bm.to.row, bm.to.col);
            clearSelection();
        }
        gameState.isAiThinking = false;
    }, 100);
}

// Expose engine for use in game.js
window.ChessEngine = {
    gameState, initializeBoard, loadBoardState, renderBoard, resetGame,
    makeMove, getLegalMoves, isKingInCheck, checkGameStatus,
    saveGameState, loadGameState, updateMoveHistory,
    makeComputerMove, getBestMove
};
