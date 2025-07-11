class TetrisBattle {
        constructor() {
            // Initialize elements first
            this.initializeElements();
            
            // WebSocket related
            this.ws = null;
            this.playerId = '';
            this.roomId = '';
            this.reconnectInterval = 1000; // Initial reconnect interval in ms (1 second)
            this.reconnectAttempts = 0; // Number of reconnection attempts
            this.maxReconnectInterval = 30000; // Max reconnect interval in ms (30 seconds)
            this.reconnectTimeoutId = null; // Reconnection timer ID

            // Game state
            this.gameStarted = false;
            this.gameEnded = false;
            this.animationFrameId = null;

            // Tetris settings
            this.COLS = 10;
            this.ROWS = 20;
            this.BLOCK_SIZE = 18; // Each block is 18x18 pixels
            this.board = this.createEmptyBoard();
            
            // Opponent's board
            this.opponentBoard = this.createEmptyBoard();

            this.score = 0;
            this.level = 1;
            this.lines = 0; // Total lines cleared
            this.dropTime = 0;
            this.dropInterval = 1000; // ms

            // === 追加: スキルゲージ関連の変数 ===
            this.skillGauge = 0;
            this.SKILL_GAUGE_MAX = 10; // スキル発動に必要なライン数
            this.skillReady = false;
            // === ここまで ===

            // HP settings
            this.maxHp = 10; // Maximum HP for a player
            this.currentHp = this.maxHp; // Current player HP
            this.opponentHp = this.maxHp; // Opponent HP

            // Character selection
            this.selectedCharacter = 'char1'; // Default character
            this.characterImages = { // Map character IDs to image URLs
                'char1': 'https://i.postimg.cc/TY2h2Q16/depixelizer-1453453341767-Photoroom.png',
                'char2': 'https://i.postimg.cc/g0h2tTSv/ガードチャージdepixelizer-1453453073611-Photoroom.png',
                'char3': 'https://i.postimg.cc/JzGnZnjY/depixelizer-1453453095778-Photoroom.png',
                // Add a default placeholder for unknown characters
                'default': 'https://placehold.co/50x50/CCCCCC/000000?text=?'
            };

            // Tetromino pieces (shapes and colors)
            // Added original index for T-Spin detection
            this.pieces = [
                { s: [[1,1,1,1]], c: '#00f0f0' }, // I (Cyan) - Index 0
                { s: [[1,1],[1,1]], c: '#f0f000' }, // O (Yellow) - Index 1
                { s: [[0,1,0],[1,1,1]], c: '#a000f0' }, // T (Purple) - Index 2
                { s: [[0,1,1],[1,1,0]], c: '#00f000' }, // S (Green) - Index 3
                { s: [[1,1,0],[0,1,1]], c: '#f00000' }, // Z (Red) - Index 4
                { s: [[1,0,0],[1,1,1]], c: '#0000f0' }, // J (Blue) - Index 5
                { s: [[0,0,1],[1,1,1]], c: '#f0a000' }  // L (Orange) - Index 6
            ];

            // SRS Wall Kick Data
            // For J, L, S, T, Z pieces
            this.srsKicks = {
                '0-1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
                '1-0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
                '1-2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
                '2-1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
                '2-3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
                '3-2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
                '3-0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
                '0-3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
            };
            // For I piece
            this.srsIKicks = {
                '0-1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
                '1-0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
                '1-2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
                '2-1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
                '2-3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
                '3-2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
                '3-0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
                '0-3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
            };
            
            this.currentPiece = null;
            this.nextPiece = this.generateRandomPiece(); // Initialize the first 'next' piece

            // Attack specific state variables
            this.lastClearedWasTetrisOrTSpin = false; // For Back-to-Back bonus
            this.consecutiveLineClears = 0; // For REN bonus
            this.lastLockedPiece = null; // To store the piece that was just locked for T-Spin checks
            this.lastLockedPieceWasRotated = false; // Flag for T-Spin rotation requirement

            // Hold feature state
            this.heldPiece = null;
            this.canHold = true; // Player can hold at the start of a turn

            // Default controls
            this.controls = {
                moveLeft: 'ArrowLeft',
                moveRight: 'ArrowRight',
                softDrop: 'ArrowDown',
                hardDrop: 'ArrowUp',
                rotate: ' ',
                hold: 'v',
                skill: 'c' // === 追加: スキルキー ===
            };

            // キャラクター能力説明
            this.characterAbilities = {
                'char1': 'ヒールリンク：同時に複数ラインを消すとHPが多めに回復',
                'char2': 'ダウンバリア：HP50%以下になるとダメージ20%カット',
                'char3': 'チェインブースト：連続してラインを消すと攻撃力が徐々に上昇（リセット式）',
                'default': '能力なし' // Default ability description
            };

            // Execute initialization
            this.init();
        }

        /**
         * @function initializeElements
         * @description Initializes DOM element references for easier access.
         */
        initializeElements() {
            this.elements = {
                lobby: document.getElementById('lobby'),
                gameArea: document.getElementById('gameArea'),
                connectionStatus: document.getElementById('connectionStatus'),
                playerNameInput: document.getElementById('playerName'),
                roomIdInput: document.getElementById('roomId'),
                joinBtn: document.querySelector('.lobby button'),
                playerTitle: document.getElementById('playerTitle'),
                playerCanvas: document.getElementById('playerCanvas'),
                playerScore: document.getElementById('playerScore'),
                playerLevel: document.getElementById('playerLevel'), 
                playerStatus: document.getElementById('playerStatus'),
                playerCharacterImg: document.getElementById('playerCharacterImg'),
                nextPieceCanvas: document.getElementById('nextPieceCanvas'), 
                holdPieceCanvas: document.getElementById('holdPieceCanvas'), 
                opponentTitle: document.getElementById('opponentTitle'),
                opponentCanvas: document.getElementById('opponentCanvas'),
                opponentScore: document.getElementById('opponentScore'),
                opponentLevel: document.getElementById('opponentLevel'), 
                opponentStatus: document.getElementById('opponentStatus'),
                opponentCharacterImg: document.getElementById('opponentCharacterImg'),
                readyBtn: document.getElementById('readyBtn'),
                gameOverOverlay: document.getElementById('gameOverOverlay'),
                gameOverMessage: document.getElementById('gameOverMessage'),
                playAgainBtn: document.getElementById('playAgainBtn'),
                returnToHomeBtn: document.getElementById('returnToHomeBtn'),
                countdownOverlay: document.getElementById('countdownOverlay'),
                countdownNumber: document.getElementById('countdownNumber'),
                settingsBtn: document.getElementById('settingsBtn'),
                settingsModal: document.getElementById('settingsModal'),
                saveSettingsBtn: document.getElementById('saveSettingsBtn'),
                cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
                settingsError: document.getElementById('settingsError'),
                characterSelection: document.getElementById('characterSelection'), 
                playerAbility: document.getElementById('playerAbility'),
                // === 追加: スキルゲージの要素 ===
                skillGaugeFill: document.getElementById('skillGaugeFill'),
                skillGaugeText: document.getElementById('skillGaugeText')
            };

            // Safely get Canvas contexts
            this.playerCtx = this.elements.playerCanvas ? this.elements.playerCanvas.getContext('2d') : null;
            this.opponentCtx = this.elements.opponentCanvas ? this.elements.opponentCanvas.getContext('2d') : null;
            this.nextPieceCtx = this.elements.nextPieceCanvas ? this.elements.nextPieceCanvas.getContext('2d') : null; 
            this.holdPieceCtx = this.elements.holdPieceCanvas ? this.elements.holdPieceCanvas.getContext('2d') : null; 
        }

        /**
         * @function init
         * @description Sets up initial event listeners and WebSocket connection.
         */
        init() {
            this.setupLobbyListeners();
            this.setupSettingsModalListeners();
            this.initWebSocket();
            this.updateControlsDisplay(); // Initial update on load
            this.elements.gameOverOverlay.style.display = 'none'; // Ensure hidden on init
            this.elements.countdownOverlay.style.display = 'none'; // Ensure hidden on init
            this.updateHpDisplay(); // Initial HP bar display
            this.updateSkillGaugeDisplay(); // === 追加: スキルゲージの初期表示 ===
            this.setupCharacterSelection(); // Setup character selection listeners
            // Set initial player character image
            if (this.elements.playerCharacterImg) {
                this.elements.playerCharacterImg.src = this.characterImages[this.selectedCharacter] || this.characterImages['default'];
            }
            if (this.elements.playerAbility) {
                this.elements.playerAbility.textContent = this.characterAbilities[this.selectedCharacter] || this.characterAbilities['default'];
            }
        }

        /**
         * @function createEmptyBoard
         * @description Creates a new empty game board (2D array filled with zeros).
         * @returns {Array<Array<number>>} An empty board array.
         */
        createEmptyBoard() {
            return Array.from({ length: this.ROWS }, () => Array(this.COLS).fill(0));
        }

        /**
         * @function setupLobbyListeners
         * @description Attaches event listeners to lobby buttons and game over buttons.
         */
        setupLobbyListeners() {
            if (this.elements.joinBtn) {
                this.elements.joinBtn.onclick = () => this.joinRoom();
            }
            if (this.elements.readyBtn) {
                this.elements.readyBtn.onclick = () => this.setReady();
            }
            if (this.elements.playAgainBtn) {
                this.elements.playAgainBtn.onclick = () => this.playAgain();
            }
            if (this.elements.returnToHomeBtn) {
                this.elements.returnToHomeBtn.onclick = () => this.returnToHome();
            }
        }

        /**
         * @function setupCharacterSelection
         * @description Sets up event listeners for character selection.
         */
        setupCharacterSelection() {
            if (this.elements.characterSelection) {
                const characterOptions = this.elements.characterSelection.querySelectorAll('.character-option');
                characterOptions.forEach(option => {
                    option.addEventListener('click', () => {
                        // Remove 'selected' class from all options
                        characterOptions.forEach(opt => opt.classList.remove('selected'));
                        // Add 'selected' class to the clicked option
                        option.classList.add('selected');
                        // Update selected character in game state
                        this.selectedCharacter = option.dataset.character;
                        // キャラクター画像も即座に切り替える
                        if (this.elements.playerCharacterImg) {
                            this.elements.playerCharacterImg.src = this.characterImages[this.selectedCharacter] || this.characterImages['default'];
                        }
                        // 能力説明も即座に切り替える
                        if (this.elements.playerAbility) {
                            this.elements.playerAbility.textContent = this.characterAbilities[this.selectedCharacter] || this.characterAbilities['default'];
                        }
                    });
                });
            }
        }

        /**
         * @function setupSettingsModalListeners
         * @description Attaches event listeners for the settings modal.
         */
        setupSettingsModalListeners() {
            if (this.elements.settingsBtn) {
                this.elements.settingsBtn.onclick = () => this.openSettingsModal();
            }
            if (this.elements.saveSettingsBtn) {
                this.elements.saveSettingsBtn.onclick = () => this.saveSettings();
            }
            if (this.elements.cancelSettingsBtn) {
                this.elements.cancelSettingsBtn.onclick = () => this.closeSettingsModal();
            }

            const keyInputs = document.querySelectorAll('.key-input');
            keyInputs.forEach(input => {
                input.onkeydown = (e) => {
                    e.preventDefault();
                    let key = e.key;
                    if (key === ' ') key = 'Space'; // Display spacebar as "Space"
                    input.value = key;
                };
            });
        }

        openSettingsModal() {
            this.elements.settingsError.textContent = '';
            // Load current controls into the modal inputs
            for (const key in this.controls) {
                const inputId = 'key' + key.charAt(0).toUpperCase() + key.slice(1);
                const inputEl = document.getElementById(inputId);
                if (inputEl) {
                    let value = this.controls[key];
                    if (value === ' ') value = 'Space';
                    inputEl.value = value;
                }
            }
            this.elements.settingsModal.style.display = 'flex';
        }

        closeSettingsModal() {
            this.elements.settingsModal.style.display = 'none';
        }

        saveSettings() {
            const newControls = {};
            const controlKeys = Object.keys(this.controls);
            const assignedKeys = new Set();
            let hasError = false;

            for (const key of controlKeys) {
                const inputId = 'key' + key.charAt(0).toUpperCase() + key.slice(1);
                const inputEl = document.getElementById(inputId);
                let value = inputEl.value;
                if (value === 'Space') value = ' '; // Convert "Space" back to a space character

                if (assignedKeys.has(value)) {
                    this.elements.settingsError.textContent = `エラー: キー「${value}」が複数の操作に割り当てられています。`;
                    hasError = true;
                    break;
                }
                assignedKeys.add(value);
                newControls[key] = value;
            }

            if (!hasError) {
                this.controls = newControls;
                this.updateControlsDisplay();
                this.closeSettingsModal();
            }
        }

        /**
         * @function initWebSocket
         * @description Initializes the WebSocket connection to the game server.
         */
        initWebSocket() {
            // Render.com deployed server URL (use wss:// for secure WebSocket)
            const wsUrl = "wss://test-lgkt.onrender.com";  // Changed to wss for secure connection
            
            this.elements.connectionStatus.textContent = "サーバーに接続中...";
            this.elements.connectionStatus.className = 'status waiting';

            // Clear any existing reconnection timeout when initiating a new connection
            if (this.reconnectTimeoutId) {
                clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = null;
            }

            // Close existing connection if any before creating a new one
            if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
                this.ws.close(); 
            }
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.elements.connectionStatus.textContent = "サーバーに接続しました！";
                this.elements.connectionStatus.className = 'status ready';
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                // Connection successful, clear any pending reconnection attempts
                if (this.reconnectTimeoutId) {
                    clearTimeout(this.reconnectTimeoutId);
                    this.reconnectTimeoutId = null;
                }
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            };

            this.ws.onclose = () => {
                this.elements.connectionStatus.textContent = "サーバーとの接続が切れました。";
                this.elements.connectionStatus.className = 'status loser';
                // If the game was active and not explicitly ended by user action (returnToHome), try to reconnect
                if (!this.gameEnded) { 
                    this.attemptReconnect();
                } else if (this.gameStarted) { // Game was active, but ended (e.g. by opponent leaving or game over)
                    this.endGame("接続エラー: 相手が退出しました"); // Indicate opponent leaving if game was active
                }
            };
            
            this.ws.onerror = (error) => {
                console.error("WebSocket Error:", error);
                this.elements.connectionStatus.textContent = "接続エラーが発生しました。";
                this.elements.connectionStatus.className = 'status loser';
                if (!this.gameEnded) { // Only attempt reconnect if game is not explicitly ended
                    this.attemptReconnect();
                }
            }
        }

        /**
         * @function attemptReconnect
         * @description Attempts to reconnect to the WebSocket server with exponential backoff.
         */
        attemptReconnect() {
            if (this.reconnectTimeoutId) {
                clearTimeout(this.reconnectTimeoutId);
            }

            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectInterval);
            
            this.elements.connectionStatus.textContent = `接続エラー。${(delay / 1000).toFixed(1)}秒後に再接続を試みます...`;
            this.elements.connectionStatus.className = 'status waiting';

            this.reconnectTimeoutId = setTimeout(() => {
                this.initWebSocket(); // Call initWebSocket to re-establish connection
            }, delay);
        }

        /**
         * @function sendMessage
         * @description Sends a message to the WebSocket server.
         * @param {string} type - The type of message.
         * @param {object} payload - The data payload for the message.
         */
        sendMessage(type, payload = {}) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type, ...payload }));
            } else {
                console.warn("WebSocket not open. Message not sent:", type, payload);
                this.elements.connectionStatus.textContent = "サーバーとの接続が失われています。";
                this.elements.connectionStatus.className = 'status loser';
            }
        }
        
        /**
         * @function handleServerMessage
         * @description Handles incoming messages from the WebSocket server.
         * @param {object} message - The parsed JSON message from the server.
         */
        handleServerMessage(message) {
            console.log("Received: ", message);
            // Overlays will be hidden/shown explicitly in relevant case blocks or functions.

            switch (message.type) {
                case 'joined':
                    this.playerId = message.playerId; // Ensure playerId is set from server acknowledgement
                    this.elements.playerTitle.textContent = this.playerId;
                    this.elements.readyBtn.disabled = false;
                    this.elements.gameOverOverlay.style.display = 'none'; // Ensure hidden when joining room
                    this.elements.countdownOverlay.style.display = 'none'; // Ensure hidden when joining room
                    this.updateHpDisplay(); // Initial HP display on join
                    // Set player's character image
                    if (this.elements.playerCharacterImg) {
                        this.elements.playerCharacterImg.src = this.characterImages[this.selectedCharacter] || this.characterImages['default'];
                    }
                    if (message.room.playerCount > 1) {
                        this.updateOpponentStatus(message.room.players.find(p => p.id !== this.playerId));
                    }
                    break;
                case 'playerJoined':
                    console.log("Player Joined Message, Character:", message.player.character); // Log opponent character
                    this.updateOpponentStatus(message.player);
                    break;
                case 'playerReady':
                    if (message.playerId !== this.playerId) {
                        this.elements.opponentStatus.textContent = '準備完了';
                        this.elements.opponentStatus.className = 'status ready';
                    } else {
                        // My own ready status acknowledgement from server or when I set ready.
                        // Clarify current player's status for pending opponent.
                        this.elements.playerStatus.textContent = '準備完了！相手を待っています...';
                        this.elements.playerStatus.className = 'status ready';
                    }
                    this.elements.gameOverOverlay.style.display = 'none'; // Ensure hidden when a player becomes ready
                    this.elements.countdownOverlay.style.display = 'none'; // Ensure hidden when a player becomes ready
                    break;
                case 'playerLeft':
                    this.elements.opponentTitle.textContent = '相手';
                    this.elements.opponentStatus.textContent = '相手が退出しました';
                    this.elements.opponentStatus.className = 'status waiting';
                    this.opponentBoard = this.createEmptyBoard(); // Clear opponent's board
                    this.draw(); // Redraw to reflect changes
                    // If game was active, end it due to opponent leaving
                    if (this.gameStarted && !this.gameEnded) {
                        this.endGame("相手が退出しました");
                    }
                    break;
                case 'gameStart':
                    // This is the only place where startBattle is called, ensuring server sync.
                    this.startBattle(message.timestamp);
                    break;
                case 'opponentUpdate':
                    console.log("Opponent Update Message, Character:", message.character); // Log opponent character
                    this.updateOpponent(message);
                    break;
                case 'attack':
                    // Server might not send attackType, so default it for visual feedback
                    this.addAttackLines(message.lines, message.attackType || 'ATTACK');
                    // HP情報も更新
                    if (message.hp !== undefined) {
                        this.opponentHp = Number(message.hp);
                        this.updateHpDisplay();
                    }
                    break;
                case 'gameEnd':
                    this.endGame(message.winner === this.playerId ? 'あなたの勝利！' : 'あなたの負け...');
                    if (message.winner === this.playerId) {
                        this.elements.playerStatus.className = 'status winner';
                        this.elements.opponentStatus.className = 'status loser';
                    } else {
                        this.elements.playerStatus.className = 'status loser';
                        this.elements.opponentStatus.className = 'status winner';
                    }
                    break;
                case 'error':
                    // Use a custom modal or just update status for error messages
                    this.elements.connectionStatus.textContent = `エラー: ${message.message}`;
                    this.elements.connectionStatus.className = 'status loser';
                    this.elements.lobby.style.display = 'block';
                    this.elements.gameArea.style.display = 'none';
                    this.elements.gameOverOverlay.style.display = 'none'; // Hide overlay on error
                    this.elements.countdownOverlay.style.display = 'none'; // Hide countdown on error
                    break;
            }
        }
        
        /**
         * @function joinRoom
         * @description Sends a request to join a room on the server.
         */
        joinRoom() {
            this.playerId = this.elements.playerNameInput.value.trim();
            this.roomId = this.elements.roomIdInput.value.trim();
            
            if(!this.playerId) {
                // Use a custom modal or message box instead of alert()
                this.elements.connectionStatus.textContent = "プレイヤー名を入力してください。";
                this.elements.connectionStatus.className = 'status loser';
                return;
            }

            this.elements.lobby.style.display = 'none';
            this.elements.gameArea.style.display = 'flex'; // Show game area
            this.elements.gameOverOverlay.style.display = 'none'; // Ensure overlay is hidden
            this.elements.countdownOverlay.style.display = 'none'; // Ensure countdown is hidden
            this.elements.readyBtn.style.display = 'block'; // Show ready button

            // Set player's character image here as well, so it shows up when entering game area
            if (this.elements.playerCharacterImg) {
                const imageUrl = this.characterImages[this.selectedCharacter] || this.characterImages['default'];
                this.elements.playerCharacterImg.src = imageUrl;
                console.log("Setting player character image to:", imageUrl, "for character:", this.selectedCharacter); // Debug log
            }

            
            this.updateControlsDisplay(); // Update controls text in the game view
            // 能力説明も反映
            if (this.elements.playerAbility) {
                this.elements.playerAbility.textContent = this.characterAbilities[this.selectedCharacter] || this.characterAbilities['default'];
            }
            this.sendMessage('joinRoom', { playerId: this.playerId, roomId: this.roomId, character: this.selectedCharacter });
            // バトル画面に入るとき能力説明を表示
            if (this.elements.playerAbility) {
                this.elements.playerAbility.style.display = 'block';
                this.elements.playerAbility.textContent = this.characterAbilities[this.selectedCharacter] || this.characterAbilities['default'];
            }
        }
        
        /**
         * @function setReady
         * @description Notifies the server that the player is ready to start the game.
         */
        setReady() {
            this.sendMessage('ready');
            this.elements.readyBtn.disabled = true;
            // Immediate local update for clarity, server will confirm.
            this.elements.playerStatus.textContent = '準備完了！相手を待っています...';
            this.elements.playerStatus.className = 'status ready';
            // Also hide game over overlay here as a safety in case playAgain didn't hide it for some reason.
            this.elements.gameOverOverlay.style.display = 'none';  
            this.elements.countdownOverlay.style.display = 'none'; // Ensure countdown is also hidden
        }

        /**
         * @function playAgain
         * @description Handles "Play Again" button click, resets game state and signals readiness.
         */
        playAgain() {
            // Hide game over screen immediately when "Play Again" is clicked
            this.elements.gameOverOverlay.style.display = 'none';  
            this.elements.countdownOverlay.style.display = 'none'; // Ensure countdown is also hidden

            this.resetPlayerState(); // Reset player's board, score, etc.
            this.elements.playerStatus.textContent = '待機中...'; // Reset to initial state before setting ready
            this.elements.playerStatus.className = 'status waiting';
            this.elements.opponentStatus.textContent = '待機中...';
            this.elements.opponentStatus.className = 'status waiting';
            this.elements.readyBtn.style.display = 'block'; // Show ready button again
            this.elements.readyBtn.disabled = false; // Enable ready button
            this.setReady(); // Signal readiness to the server, which will update status again.
        }

        /**
         * @function returnToHome
         * @description Handles "Return to Home" button click, shows lobby and resets game.
         */
        returnToHome() {
            this.elements.gameOverOverlay.style.display = 'none'; // Hide game over screen
            this.elements.countdownOverlay.style.display = 'none'; // Hide countdown overlay
            this.elements.gameArea.style.display = 'none'; // Hide game area
            this.elements.lobby.style.display = 'block'; // Show lobby

            this.sendMessage('leaveRoom', { playerId: this.playerId, roomId: this.roomId }); // Notify server of leaving

            // Clear any pending reconnection attempts when explicitly returning home
            if (this.reconnectTimeoutId) {
                clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = null;
            }
            this.reconnectAttempts = 0; // Reset reconnection attempts when returning to home

            // Reset lobby UI elements
            this.elements.playerNameInput.value = this.playerId; // Keep player name
            this.elements.roomIdInput.value = ''; // Clear room ID
            this.elements.connectionStatus.textContent = "サーバーに接続中...";
            this.elements.connectionStatus.className = 'status waiting';
            this.elements.readyBtn.style.display = 'block'; // Ensure ready button is visible in lobby context
            this.elements.readyBtn.disabled = true; // Disable until re-joined

            // Reset player and opponent UI in game area (even if hidden)
            this.elements.playerTitle.textContent = 'あなた';
            this.elements.playerScore.textContent = '0';
            this.elements.playerLevel.textContent = '1'; // Reset player level display
            this.elements.playerStatus.textContent = '待機中...';
            this.elements.playerStatus.className = 'status waiting';
            this.elements.opponentTitle.textContent = '相手';
            this.elements.opponentScore.textContent = '0';
            this.elements.opponentLevel.textContent = '1'; // Reset opponent level display
            this.elements.opponentStatus.textContent = '待機中...';
            this.elements.opponentStatus.className = 'status waiting';
            // Clear character images
            if (this.elements.playerCharacterImg) {
                this.elements.playerCharacterImg.src = '';
            }
            if (this.elements.opponentCharacterImg) {
                this.elements.opponentCharacterImg.src = '';
            }
            // === 追加: スキルゲージのリセット ===
            this.skillGauge = 0;
            this.skillReady = false;
            this.updateSkillGaugeDisplay();
            // === ここまで ===


            this.gameEnded = true; // Ensure game logic is stopped
            this.gameStarted = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            document.onkeydown = null; // Disable controls

            // Reinitialize WebSocket to get a fresh connection for the lobby
            this.initWebSocket();

            // ロビー画面に戻るとき能力説明を非表示
            if (this.elements.playerAbility) {
                this.elements.playerAbility.style.display = 'none';
            }
        }

        /**
         * @function updateOpponentStatus
         * @description Updates the opponent's display information.
         * @param {object} opponent - Opponent's player data.
         */
        updateOpponentStatus(opponent) {
            if (opponent) {
                this.elements.opponentTitle.textContent = opponent.id;
                this.elements.opponentStatus.textContent = opponent.ready ? '準備完了' : '待機中';
                this.elements.opponentStatus.className = opponent.ready ? 'status ready' : 'status waiting';
                // 相手キャラ画像
                if (this.elements.opponentCharacterImg) {
                    this.elements.opponentCharacterImg.src = this.characterImages[opponent.character] || this.characterImages['default'];
                    console.log(`Opponent character set to: ${opponent.character}, URL: ${this.elements.opponentCharacterImg.src}`);
                }
            } else {
                 // If opponent is null, reset opponent display
                this.elements.opponentTitle.textContent = '相手';
                this.elements.opponentStatus.textContent = '待機中...';
                this.elements.opponentStatus.className = 'status waiting';
                if (this.elements.opponentCharacterImg) {
                    this.elements.opponentCharacterImg.src = ''; // Clear opponent image
                }
            }
        }
        
        /**
         * @function updateOpponent
         * @description Updates the opponent's game state (score, level, board).
         * @param {object} data - Opponent's game data.
         */
        updateOpponent(data) {
            this.elements.opponentScore.textContent = data.score;
            this.elements.opponentLevel.textContent = data.level; // Update opponent's level display
            this.opponentBoard = data.board;
            this.opponentHp = Number(data.hp); // Ensure opponent HP is a number
            // Update opponent's character image if provided
            if (data.character && this.elements.opponentCharacterImg) {
                this.elements.opponentCharacterImg.src = this.characterImages[data.character] || this.characterImages['default'];
                console.log(`Opponent character set to (from updateOpponent): ${data.character}, URL: ${this.elements.opponentCharacterImg.src}`);
            }
            this.updateHpDisplay(); // Update HP bar display after opponent's HP changes
            this.draw(); // Redraw opponent's board
        }

        /**
         * @function startBattle
         * @description Initiates the game battle, setting up controls and starting the game loop.
         * @param {number} serverTime - Timestamp from server (unused directly in client loop for now).
         */
        startBattle(serverTime) {
            this.gameStarted = true;
            this.gameEnded = false;
            
            // Ensure any overlays are hidden right before starting the game
            this.elements.gameOverOverlay.style.display = 'none';  
            this.elements.countdownOverlay.style.display = 'flex'; // Show countdown overlay immediately

            this.elements.playerStatus.textContent = 'バトル中！';
            this.elements.playerStatus.className = 'status playing';
            this.elements.opponentStatus.textContent = 'バトル中！';
            this.elements.opponentStatus.className = 'status playing';
            this.elements.readyBtn.style.display = 'none'; // Hide ready button

            // Disable controls during countdown
            document.onkeydown = null;

            // Start countdown
            let countdown = 3;
            this.elements.countdownNumber.textContent = countdown;
            this.elements.countdownNumber.style.animation = 'none'; // Reset animation
            void this.elements.countdownNumber.offsetWidth; // Trigger reflow to restart animation
            this.elements.countdownNumber.style.animation = 'pulseScale 1s infinite alternate'; // Restart animation


            const countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    this.elements.countdownNumber.textContent = countdown;
                } else if (countdown === 0) {
                    this.elements.countdownNumber.textContent = 'スタート！';
                } else {
                    clearInterval(countdownInterval);
                    this.elements.countdownOverlay.style.display = 'none'; // Hide countdown overlay

                    // Resume game logic after countdown
                    this.setupGameControls();
                    this.resetPlayerState(); // Reset player's board, score etc.
                    this.newPiece(); // Spawn first piece
                    
                    this.dropTime = Date.now(); // Initialize drop timer
                    this.gameLoop(); // Start game loop
                }
            }, 1000);
            // バトル開始時にも能力説明を表示
            if (this.elements.playerAbility) {
                this.elements.playerAbility.style.display = 'block';
                this.elements.playerAbility.textContent = this.characterAbilities[this.selectedCharacter] || this.characterAbilities['default'];
            }
        }

        /**
         * @function endGame
         * @description Ends the current game, stops the loop, and displays end message.
         * @param {string} message - Message to display at the end of the game.
         */
        endGame(message) {
            if (this.gameEnded) return; // Prevent multiple end game calls
            this.gameEnded = true;
            this.gameStarted = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            this.elements.playerStatus.textContent = message;
            // Disable key controls
            document.onkeydown = null;
            
            // Ensure countdown overlay is hidden if game ends while it's active
            this.elements.countdownOverlay.style.display = 'none';

            // Clear any pending reconnection attempts when game ends
            if (this.reconnectTimeoutId) {
                clearTimeout(this.reconnectTimeoutId);
                this.reconnectTimeoutId = null;
            }

            // Show game over overlay
            this.elements.gameOverMessage.textContent = message;
            this.elements.gameOverOverlay.style.display = 'flex'; // Show the overlay
        }

        /**
         * @function resetPlayerState
         * @description Resets player-specific game variables to initial values.
         */
        resetPlayerState() {
            this.board = this.createEmptyBoard();
            this.score = 0;
            this.level = 1;
            this.lines = 0;
            this.dropInterval = 1000;
            this.lastClearedWasTetrisOrTSpin = false;
            this.consecutiveLineClears = 0;
            this.lastLockedPiece = null;
            this.lastLockedPieceWasRotated = false;
            this.heldPiece = null;
            this.canHold = true;
            this.currentHp = this.maxHp; // Reset HP
            this.opponentHp = this.maxHp; // Reset opponent HP on player side

            // === 追加: スキルゲージのリセット ===
            this.skillGauge = 0;
            this.skillReady = false;
            this.updateSkillGaugeDisplay();
            // === ここまで ===

            this.elements.playerScore.textContent = this.score;
            this.elements.playerLevel.textContent = this.level; // Update player level display
            this.updateHpDisplay(); // Update HP bar display on reset
            this.draw();
        }
        
        /**
         * @function setupGameControls
         * @description Sets up keyboard event listeners for game control.
         */
        setupGameControls() {
            document.onkeydown = (e) => {
                if (this.gameEnded || !this.currentPiece) return;

                // Prevent default scrolling for all game keys
                if (Object.values(this.controls).includes(e.key) || Object.values(this.controls).includes(e.key.toLowerCase())) {
                    e.preventDefault();
                }

                // Using the controls object to map keys to actions
                if (e.key === this.controls.moveLeft) {
                    this.move(-1);
                } else if (e.key === this.controls.moveRight) {
                    this.move(1);
                } else if (e.key === this.controls.softDrop) {
                    this.drop();
                } else if (e.key === this.controls.hardDrop) {
                    this.hardDrop();
                } else if (e.key === this.controls.rotate) {
                    this.rotate();
                } else if (e.key.toLowerCase() === this.controls.hold.toLowerCase()) { // Case-insensitive hold
                    this.holdPiece();
                } else if (e.key.toLowerCase() === this.controls.skill.toLowerCase()) { // === 追加: スキル発動 ===
                    this.activateSkill();
                }

                this.draw(); // Redraw after each key press
            }
        }

        /**
         * @function updateControlsDisplay
         * @description Updates the controls text in the UI based on current settings.
         */
        updateControlsDisplay() {
            const controlsEl = document.querySelector('.controls');
            if (controlsEl) {
                const keyToDisplay = (key) => (key === ' ') ? 'Space' : key.toUpperCase();
                // === 変更: スキルキーを説明に追加 ===
                controlsEl.innerHTML = 
                    `${keyToDisplay(this.controls.moveLeft)}/${keyToDisplay(this.controls.moveRight)}/${keyToDisplay(this.controls.softDrop)}: 移動<br>` +
                    `${keyToDisplay(this.controls.hardDrop)}: 瞬時落下 | ${keyToDisplay(this.controls.rotate)}: 回転<br>` +
                    `${keyToDisplay(this.controls.hold)}: ホールド | ${keyToDisplay(this.controls.skill)}: スキル`;
            }
        }
        
        // === 追加: スキルゲージの表示を更新する関数 ===
        updateSkillGaugeDisplay() {
            if (!this.elements.skillGaugeFill) return;
            const percentage = (this.skillGauge / this.SKILL_GAUGE_MAX) * 100;
            this.elements.skillGaugeFill.style.width = `${percentage}%`;

            if (this.skillReady) {
                this.elements.skillGaugeFill.classList.add('ready');
                this.elements.skillGaugeText.textContent = "SKILL READY!";
            } else {
                this.elements.skillGaugeFill.classList.remove('ready');
                this.elements.skillGaugeText.textContent = "SKILL";
            }
        }

        // === 追加: スキルを発動する関数 ===
        activateSkill() {
            if (!this.skillReady) {
                console.log("スキルがまだ使えません。");
                return;
            }

            console.log("スキル発動！");
            
            // スキル効果: 自分のおじゃまブロックを2ライン消す
            let clearedCount = 0;
            for (let i = 0; i < 2; i++) {
                // 下から探索しておじゃまブロックの行を探す
                for (let y = this.ROWS - 1; y >= 0; y--) {
                    // 行がおじゃまブロック（'#808080'）で構成されているかチェック
                    if (this.board[y].every(cell => cell === '#808080' || cell === 0)) {
                        this.board.splice(y, 1); // その行を削除
                        const newRow = Array(this.COLS).fill(0);
                        this.board.unshift(newRow); // 一番上に新しい空の行を追加
                        clearedCount++;
                        break; // 1行消したら内側のループを抜けて次の行を探す
                    }
                }
            }

            if(clearedCount > 0){
                this.displayAttackIndicator(clearedCount, 'スキル発動！', true);
            }
            
            // ゲージをリセット
            this.skillReady = false;
            this.skillGauge = 0;
            this.updateSkillGaugeDisplay();
            this.draw(); // ボードを再描画
        }


        /**
         * @function getGhostPiece
         * @description Calculates the position of the ghost piece (prediction).
         * @returns {object|null} The ghost piece object or null if no current piece.
         */
        getGhostPiece() {
            if (!this.currentPiece) return null;
            
            const ghostPiece = {
                shape: this.currentPiece.shape,
                color: this.currentPiece.color,
                x: this.currentPiece.x,
                y: this.currentPiece.y
            };
            
            while (this.isValid(ghostPiece)) {
                ghostPiece.y++;
            }
            ghostPiece.y--; // Revert to the last valid position
            
            return ghostPiece;
        }

        /**
         * @function gameLoop
         * @description The main game loop responsible for updating game state and drawing.
         * @param {DOMHighResTimeStamp} time - The timestamp provided by requestAnimationFrame.
         */
        gameLoop(time = 0) {
            if (this.gameEnded) return;

            // Automatic piece drop based on interval
            if (Date.now() - this.dropTime > this.dropInterval) {
                this.drop();
            }

            this.draw(); // Redraw the game board
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        }

        /**
         * @function draw
         * @description Draws both player's and opponent's game boards and pieces.
         */
        draw() {
            // Draw player's board
            if (this.playerCtx && this.elements.playerCanvas) {
                this.playerCtx.clearRect(0, 0, this.elements.playerCanvas.width, this.elements.playerCanvas.height);
                this.drawBoard(this.playerCtx, this.board);
                
                // Draw ghost piece (prediction)
                const ghostPiece = this.getGhostPiece();
                if (ghostPiece && this.currentPiece && ghostPiece.y !== this.currentPiece.y) {
                    this.drawGhostPiece(this.playerCtx, ghostPiece);
                }
                
                // Draw current piece
                if (this.currentPiece) {
                    this.drawPiece(this.playerCtx, this.currentPiece);
                }
            }
            
            // Draw opponent's board
            if (this.opponentCtx && this.elements.opponentCanvas) {
                this.opponentCtx.clearRect(0, 0, this.elements.opponentCanvas.width, this.elements.opponentCanvas.height);
                this.drawBoard(this.opponentCtx, this.opponentBoard);
            }

            // Draw next piece
            if (this.nextPieceCtx && this.elements.nextPieceCanvas) {
                this.nextPieceCtx.clearRect(0, 0, this.elements.nextPieceCanvas.width, this.elements.nextPieceCanvas.height);
                this.nextPieceCtx.strokeStyle = '#333';
                this.nextPieceCtx.lineWidth = 2;
                this.nextPieceCtx.strokeRect(0, 0, this.elements.nextPieceCanvas.width, this.elements.nextPieceCanvas.height);
                this.drawNextPiece(this.nextPieceCtx, this.nextPiece);
            }

            // Draw held piece
            if (this.holdPieceCtx && this.elements.holdPieceCanvas) {
                this.holdPieceCtx.clearRect(0, 0, this.elements.holdPieceCanvas.width, this.elements.holdPieceCanvas.height);
                this.holdPieceCtx.strokeStyle = '#333';
                this.holdPieceCtx.lineWidth = 2;
                this.holdPieceCtx.strokeRect(0, 0, this.elements.holdPieceCanvas.width, this.elements.holdPieceCanvas.height);
                if (this.heldPiece) {
                    this.drawNextPiece(this.holdPieceCtx, this.heldPiece); // Re-use the same drawing logic
                }
            }
        }

        /**
         * @function drawBoard
         * @description Draws the given board state onto the canvas.
         * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
         * @param {Array<Array<number|string>>} board - The game board to draw.
         */
        drawBoard(ctx, board) {
            if (!ctx) return;

            // Explicitly draw the black background for the entire board area
            ctx.fillStyle = '#000'; // Black background
            ctx.fillRect(0, 0, this.COLS * this.BLOCK_SIZE, this.ROWS * this.BLOCK_SIZE);

            board.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) { // If it's not an empty cell
                        ctx.fillStyle = typeof value === "string" ? value : "#00f0f0"; // Use stored color or default
                        ctx.fillRect(x * this.BLOCK_SIZE, y * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                        // Draw block border for better visibility
                        ctx.strokeStyle = '#222';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x * this.BLOCK_SIZE, y * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                    }
                });
            });
        }

        /**
         * @function drawPiece
         * @description Draws a given tetromino piece on the canvas.
         * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
         * @param {object} piece - The piece object to draw.
         */
        drawPiece(ctx, piece) {
            if (!ctx) return;
            ctx.fillStyle = piece.color;
            piece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        ctx.fillRect((piece.x + x) * this.BLOCK_SIZE, (piece.y + y) * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                        ctx.strokeStyle = '#222';
                        ctx.lineWidth = 1;
                        ctx.strokeRect((piece.x + x) * this.BLOCK_SIZE, (piece.y + y) * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                    }
                });
            });
        }

        /**
         * @function drawGhostPiece
         * @description Draws the ghost piece as a translucent outline.
         * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
         * @param {object} piece - The ghost piece object to draw.
         */
        drawGhostPiece(ctx, piece) {
            if (!ctx) return;
            ctx.save();
            ctx.globalAlpha = 0.5; // 半透明度を0.3から0.5に増加して、より濃くする
            ctx.strokeStyle = piece.color; // Use piece color for outline
            ctx.lineWidth = 2; // Thicker line for ghost
            ctx.setLineDash([4, 4]); // Dashed line

            piece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        ctx.strokeRect((piece.x + x) * this.BLOCK_SIZE, (piece.y + y) * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                    }
                });
            });
            ctx.restore();
        }

        /**
         * @function drawNextPiece
         * @description Draws the next tetromino piece on its dedicated canvas.
         * @param {CanvasRenderingContext2D} ctx - The next piece canvas rendering context.
         * @param {object} piece - The next piece object to draw.
         */
        drawNextPiece(ctx, piece) {
            if (!ctx || !piece) return;
            ctx.fillStyle = piece.color;
            
            const pieceWidthBlocks = piece.shape[0].length;
            const pieceHeightBlocks = piece.shape.length;

            // Use the actual canvas dimensions for centering
            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;

            // Calculate offset to center the piece in the canvas
            const offsetX = (canvasWidth / 2) - (pieceWidthBlocks * this.BLOCK_SIZE / 2);
            const offsetY = (canvasHeight / 2) - (pieceHeightBlocks * this.BLOCK_SIZE / 2);

            piece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        ctx.fillRect(offsetX + x * this.BLOCK_SIZE, offsetY + y * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                        ctx.strokeStyle = '#222';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(offsetX + x * this.BLOCK_SIZE, offsetY + y * this.BLOCK_SIZE, this.BLOCK_SIZE, this.BLOCK_SIZE);
                    }
                });
            });
        }


        /**
         * @function generateRandomPiece
         * @description Generates a single random tetromino piece object.
         * @returns {object} A new piece object.
         */
        generateRandomPiece() {
            const randomIndex = Math.floor(Math.random() * this.pieces.length);
            const pieceDef = this.pieces[randomIndex];
            return {
                shape: JSON.parse(JSON.stringify(pieceDef.s)), // Deep copy shape
                color: pieceDef.c,
                x: Math.floor(this.COLS / 2) - Math.floor(pieceDef.s[0].length / 2),
                y: 0,
                originalPieceIndex: randomIndex,
                rotationState: 0,
                wasRotatedBeforeLock: false
            };
        }

        /**
         * @function newPiece
         * @description Spawns a new random tetromino piece. Ends game if new piece cannot be placed.
         */
        newPiece() {
            // The piece that was previously 'next' now becomes 'current'
            this.currentPiece = this.nextPiece;
            // Generate a brand new piece for the 'next' slot
            this.nextPiece = this.generateRandomPiece();

            // Reset current piece's rotation flag for T-Spin detection
            if (this.currentPiece) {
                this.currentPiece.wasRotatedBeforeLock = false;
            }

            // Check if the newly assigned current piece can be placed
            if (!this.isValid(this.currentPiece)) {
                this.endGame("ゲームオーバー");
                this.sendMessage('gameOver');
            }
        }

        /**
         * @function move
         * @description Moves the current piece horizontally.
         * @param {number} dir - Direction of movement (-1 for left, 1 for right).
         */
        move(dir) {
            if (!this.currentPiece) return;
            const originalX = this.currentPiece.x;
            this.currentPiece.x += dir;
            if (!this.isValid(this.currentPiece)) {
                this.currentPiece.x = originalX; // Revert if invalid
            }
        }

        /**
         * @function rotate
         * @description Rotates the current piece.
         */
        rotate() {
            if (!this.currentPiece) return;

            const originalShape = JSON.parse(JSON.stringify(this.currentPiece.shape));
            const originalRotationState = this.currentPiece.rotationState;
            const originalX = this.currentPiece.x;
            const originalY = this.currentPiece.y;

            // Perform rotation
            const newShape = this.currentPiece.shape[0].map((_, colIndex) => 
                this.currentPiece.shape.map(row => row[colIndex]).reverse()
            );
            this.currentPiece.shape = newShape;
            this.currentPiece.rotationState = (this.currentPiece.rotationState + 1) % 4;

            // Check for valid rotation with SRS wall kicks
            const kickData = this.currentPiece.originalPieceIndex === 0 ? this.srsIKicks : this.srsKicks;
            const kickKey = `${originalRotationState}-${this.currentPiece.rotationState}`;
            const kicks = kickData[kickKey] || [[0, 0]]; // Default to no kick if not defined

            let validKick = false;
            for (const kick of kicks) {
                this.currentPiece.x += kick[0];
                this.currentPiece.y -= kick[1]; // SRS y-kicks are often inverted
                if (this.isValid(this.currentPiece)) {
                    validKick = true;
                    break;
                }
                // Revert if kick is invalid
                this.currentPiece.x = originalX;
                this.currentPiece.y = originalY;
            }

            // If no valid kick was found, revert rotation
            if (!validKick) {
                this.currentPiece.shape = originalShape;
                this.currentPiece.rotationState = originalRotationState;
            } else {
                // If rotation was successful, set the flag
                this.currentPiece.wasRotatedBeforeLock = true;
            }
        }

        /**
         * @function drop
         * @description Moves the current piece down by one row. Locks piece if it hits the bottom or another piece.
         */
        drop() {
            if (!this.currentPiece) return;
            this.currentPiece.y++;
            if (!this.isValid(this.currentPiece)) {
                this.currentPiece.y--;
                this.lockPiece();
                this.newPiece();
            } else {
                this.dropTime = Date.now(); // Reset drop timer only on successful drop
            }
        }

        /**
         * @function hardDrop
         * @description Instantly drops the piece to the lowest possible position.
         */
        hardDrop() {
            if (!this.currentPiece) return;
            while (this.isValid(this.currentPiece)) {
                this.currentPiece.y++;
            }
            this.currentPiece.y--; // Revert to last valid position
            this.lockPiece();
            this.newPiece();
        }

        /**
         * @function holdPiece
         * @description Holds the current piece and swaps it with the held piece (if any).
         */
        holdPiece() {
            if (!this.canHold) return; // Can only hold once per turn

            if (this.heldPiece) {
                // Swap current and held piece
                const temp = this.currentPiece;
                this.currentPiece = this.heldPiece;
                this.heldPiece = temp;

                // Reset the position of the new current piece
                this.currentPiece.x = Math.floor(this.COLS / 2) - Math.floor(this.currentPiece.shape[0].length / 2);
                this.currentPiece.y = 0;
            } else {
                // If no piece is held, hold the current one and get a new piece
                this.heldPiece = this.currentPiece;
                this.newPiece();
            }

            this.canHold = false; // Disable holding until a new piece is locked
            this.draw(); // Redraw to show the new held piece
        }

        /**
         * @function isValid
         * @description Checks if the current piece's position is valid (within bounds and not colliding).
         * @param {object} piece - The piece to validate.
         * @returns {boolean} True if the position is valid, false otherwise.
         */
        isValid(piece) {
            if (!piece || !piece.shape) return false;
            for (let y = 0; y < piece.shape.length; y++) {
                for (let x = 0; x < piece.shape[y].length; x++) {
                    if (piece.shape[y][x] > 0) {
                        const newX = piece.x + x;
                        const newY = piece.y + y;
                        if (newX < 0 || newX >= this.COLS || newY >= this.ROWS || (this.board[newY] && this.board[newY][newX] !== 0)) {
                            return false;
                        }
                    }
                }
            }
            return true;
        }

        /**
         * @function lockPiece
         * @description Locks the current piece onto the board, checks for line clears, and updates the score.
         */
        lockPiece() {
            if (!this.currentPiece) return;

            // Store the piece that is about to be locked for T-Spin checks
            this.lastLockedPiece = this.currentPiece;

            this.currentPiece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        this.board[this.currentPiece.y + y][this.currentPiece.x + x] = this.currentPiece.color;
                    }
                });
            });

            this.canHold = true; // Allow holding again
            this.clearLines();
            this.sendMessage('update', { board: this.board, score: this.score, level: this.level, hp: this.currentHp, character: this.selectedCharacter });
        }

        /**
         * @function clearLines
         * @description Checks for and clears completed lines, calculates score and attacks.
         */
        clearLines() {
            let linesCleared = 0;
            let isTSpin = this.checkTSpin();

            for (let y = this.ROWS - 1; y >= 0; y--) {
                if (this.board[y].every(cell => cell !== 0)) {
                    linesCleared++;
                    this.board.splice(y, 1);
                    const newRow = Array(this.COLS).fill(0);
                    this.board.unshift(newRow);
                    y++; // Re-check the same row index as it's now a new row
                }
            }

            if (linesCleared > 0 || isTSpin) {
                this.calculateAttack(linesCleared, isTSpin);
                this.lines += linesCleared;
                this.level = Math.floor(this.lines / 10) + 1;
                this.dropInterval = Math.max(200, 1000 - (this.level - 1) * 50);
                this.elements.playerScore.textContent = this.score;
                this.elements.playerLevel.textContent = this.level; // Update player level display

                // === 追加: スキルゲージの更新 ===
                this.skillGauge += linesCleared;
                if (this.skillGauge >= this.SKILL_GAUGE_MAX) {
                    this.skillGauge = this.SKILL_GAUGE_MAX;
                    this.skillReady = true;
                }
                this.updateSkillGaugeDisplay();
                // === ここまで ===
            }
        }

        /**
         * @function checkTSpin
         * @description Checks if the last locked piece performed a T-Spin.
         * @returns {boolean} True if a T-Spin was performed, false otherwise.
         */
        checkTSpin() {
            if (!this.lastLockedPiece || this.lastLockedPiece.originalPieceIndex !== 2 || !this.lastLockedPiece.wasRotatedBeforeLock) {
                return false; // Not a T-piece or wasn't rotated
            }

            const piece = this.lastLockedPiece;
            const corners = [
                [piece.y, piece.x], // Top-left
                [piece.y, piece.x + 2], // Top-right
                [piece.y + 2, piece.x], // Bottom-left
                [piece.y + 2, piece.x + 2]  // Bottom-right
            ];

            let occupiedCorners = 0;
            for (const [y, x] of corners) {
                if (y < 0 || y >= this.ROWS || x < 0 || x >= this.COLS || this.board[y][x] !== 0) {
                    occupiedCorners++;
                }
            }

            return occupiedCorners >= 3;
        }

        /**
         * @function calculateAttack
         * @description Calculates the number of attack lines to send based on line clears and special moves.
         * @param {number} linesCleared - The number of lines cleared in the last move.
         * @param {boolean} isTSpin - Whether the last move was a T-Spin.
         */
        calculateAttack(linesCleared, isTSpin) {
            let baseAttack = 0;
            let attackType = '';

            if (isTSpin) {
                switch (linesCleared) {
                    case 1: baseAttack = 2; attackType = 'T-Spin Single'; break;
                    case 2: baseAttack = 4; attackType = 'T-Spin Double'; break;
                    case 3: baseAttack = 6; attackType = 'T-Spin Triple'; break;
                    default: baseAttack = 0; // T-Spin with 0 lines
                }
            } else {
                switch (linesCleared) {
                    case 2: baseAttack = 1; attackType = 'Double'; break;
                    case 3: baseAttack = 2; attackType = 'Triple'; break;
                    case 4: baseAttack = 4; attackType = 'Tetris'; break;
                }
            }

            if (baseAttack > 0) {
                // Back-to-Back Bonus
                if (this.lastClearedWasTetrisOrTSpin) {
                    baseAttack += 1;
                    attackType = `B2B ${attackType}`;
                }
                this.lastClearedWasTetrisOrTSpin = true;

                // REN (Combo) Bonus
                if (this.consecutiveLineClears > 0) {
                    const renBonus = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5][Math.min(this.consecutiveLineClears, 11)];
                    baseAttack += renBonus;
                    attackType = `${attackType} (${this.consecutiveLineClears + 1} REN)`;
                }
                this.consecutiveLineClears++;

                // Send attack to opponent
                this.sendAttack(baseAttack, attackType);
            } else {
                this.consecutiveLineClears = 0; // Reset REN on non-clearing move
                this.lastClearedWasTetrisOrTSpin = false;
            }

            // Update score
            let scoreToAdd = 0;
            if (isTSpin) {
                scoreToAdd = [400, 800, 1200, 1600][linesCleared] * this.level;
            } else {
                scoreToAdd = [100, 300, 500, 800][linesCleared - 1] * this.level || 0;
            }
            this.score += scoreToAdd;
        }

        /**
         * @function sendAttack
         * @description Sends an attack message to the server.
         * @param {number} lines - The number of attack lines.
         * @param {string} type - The type of attack for display.
         */
        sendAttack(lines, type) {
            if (lines > 0) {
                this.sendMessage('attack', { lines: lines, attackType: type });
                this.displayAttackIndicator(lines, type, true); // Display indicator for player's own attack
            }
        }

        /**
         * @function addAttackLines
         * @description Adds garbage lines to the bottom of the player's board.
         * @param {number} numLines - The number of garbage lines to add.
         * @param {string} attackType - The type of attack received.
         */
        addAttackLines(numLines, attackType) {
            // Display attack indicator
            this.displayAttackIndicator(numLines, attackType, false);

            // ダメージ軽減（ダウンバリア）
            let actualDamage = numLines;
            if (this.selectedCharacter === 'char2' && this.currentHp <= this.maxHp * 0.5) {
                actualDamage = Math.ceil(numLines * 0.8); // 20% damage reduction
            }

            // HPを減らす
            this.currentHp -= actualDamage;
            if (this.currentHp < 0) this.currentHp = 0;

            // HP回復（ヒールリンク）
            if (this.selectedCharacter === 'char1' && numLines >= 2) {
                this.currentHp += Math.floor(numLines / 2); // 2ライン以上で回復
                if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
            }

            this.updateHpDisplay();

            if (this.currentHp <= 0) {
                this.endGame("あなたの負け...");
                this.sendMessage('gameOver');
                return;
            }

            // Add garbage lines to the board
            const hole = Math.floor(Math.random() * this.COLS);
            for (let i = 0; i < numLines; i++) {
                const newRow = Array(this.COLS).fill('#808080'); // Gray for garbage
                newRow[hole] = 0; // Create a hole
                this.board.shift(); // Remove top row
                this.board.push(newRow); // Add garbage row at the bottom
            }
            this.draw(); // Redraw to show garbage lines
        }

        /**
         * @function displayAttackIndicator
         * @description Shows a visual indicator for an attack.
         * @param {number} lines - The number of attack lines.
         * @param {string} type - The type of attack.
         * @param {boolean} isSent - True if the attack was sent by the player.
         */
        displayAttackIndicator(lines, type, isSent) {
            const indicator = document.createElement('div');
            indicator.className = isSent ? 'attack-sent-indicator' : 'attack-indicator';
            indicator.textContent = `${type} (+${lines})`;
            
            const gameArea = this.elements.gameArea;
            if (gameArea) {
                gameArea.appendChild(indicator);
                setTimeout(() => {
                    if (indicator.parentNode === gameArea) {
                        gameArea.removeChild(indicator);
                    }
                }, 1500); // Remove after 1.5 seconds
            }
        }

        /**
         * @function updateHpDisplay
         * @description Updates the HP bars for both player and opponent.
         */
        updateHpDisplay() {
            // This function can be expanded to show HP bars if desired.
            // For now, it just logs the HP state.
            console.log(`Player HP: ${this.currentHp}/${this.maxHp}, Opponent HP: ${this.opponentHp}/${this.maxHp}`);
        }
    }

    // Initialize the game when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        window.tetrisGame = new TetrisBattle();
    });
