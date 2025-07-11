// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs'); // fsモジュールが使用されていないようです
const { Pool } = require('pg');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

// PostgreSQL接続設定
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 静的ファイル配信
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// `tetris-server`ディレクトリの静的ファイル配信
// このサーバーファイルが tetris-server のルートにある場合、パスを調整します。
// 例: /public を追加して、クライアントのindex.htmlから参照されるCSS/JSが正しくロードされるようにします。
app.use(express.static(path.join(__dirname, '../'))); // index.htmlがあるディレクトリを静的ファイルルートに設定

// APIルーティング（これはそのまま）
app.post('/api/rooms/:roomId/join', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.body;
    try {
        await pool.query(
            'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING', // ON CONFLICT句を修正
            [roomId, userId]
        );
        res.sendStatus(200);
    } catch (error) {
        console.error('Error joining room in DB:', error);
        res.status(500).send('Database error');
    }
});

app.post('/api/rooms/:roomId/leave', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.body;
    try {
        await pool.query(
            'DELETE FROM room_members WHERE room_id = $1 AND user_id = $2',
            [roomId, userId]
        );
        res.sendStatus(200);
    } catch (error) {
        console.error('Error leaving room in DB:', error);
        res.status(500).send('Database error');
    }
});

app.get('/api/rooms/:roomId/members', async (req, res) => {
    const { roomId } = req.params;
    try {
        const result = await pool.query(
            'SELECT user_id FROM room_members WHERE room_id = $1',
            [roomId]
        );
        res.json(result.rows.map(row => row.user_id));
    } catch (error) {
        console.error('Error getting room members from DB:', error);
        res.status(500).send('Database error');
    }
});


// サーバー・WebSocketサーバーの統合
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ゲームルーム管理
class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = []; // { ws, id, character, ready, hp, skillGauge, isSkillActive, char3AttackBoost, lastStandUsed, skillTimeoutId }
        this.gameState = {
            started: false,
            // サーバー側でボードの状態を保持する必要は、今回は厳密にはないが、
            // 今後の拡張（観戦モードなど）のために残しておくのはアリ
            board1: Array(20).fill().map(() => Array(10).fill(0)), 
            board2: Array(20).fill().map(() => Array(10).fill(0)),
            scores: [0, 0],
            levels: [1, 1],
            // etc.
        };
        this.rematchReady = {};
        this.maxHp = 10; // 最大HPをサーバー側でも定義
        this.maxSkillGauge = 100; // スキルゲージの最大値
        this.skillDuration = 5000; // スキルの持続時間 (ミリ秒)
    }

    addPlayer(ws, playerId, character) {
        if (this.players.length >= 2) {
            console.log(`Room ${this.id} is full.`);
            return false;
        }

        const newPlayer = {
            ws: ws,
            id: playerId,
            character: character,
            ready: false,
            hp: this.maxHp, // HPを初期化
            skillGauge: 0, // スキルゲージを初期化
            isSkillActive: false, // スキルが発動中か
            char3AttackBoost: 1.0, // Char3の攻撃力補正
            lastStandUsed: false, // Char3の致死ダメージ無効化フラグ
            skillTimeoutId: null // スキルタイマーID
        };

        // 既存のプレイヤーに、新しいプレイヤーの参加を通知
        this.broadcast({
            type: 'playerJoined',
            player: { id: newPlayer.id, ready: newPlayer.ready, character: newPlayer.character }
        }, ws); // 新しいプレイヤー自身には送らない

        this.players.push(newPlayer);

        // 新しく参加したプレイヤーに、現在のルーム情報を送信
        // 他のプレイヤーのデータも送るようにする
        ws.send(JSON.stringify({
            type: 'joined',
            playerId: newPlayer.id,
            room: {
                players: this.players.map(p => ({
                    id: p.id,
                    ready: p.ready,
                    character: p.character,
                    hp: p.hp, // HPも送信
                    skillGauge: p.skillGauge // スキルゲージも送信
                })),
                playerCount: this.players.length
            }
        }));
        
        console.log(`Player ${playerId} joined room ${this.id}. Current players: ${this.players.length}`);
        return true;
    }
    
    removePlayer(ws) {
        const playerLeaving = this.players.find(p => p.ws === ws);
        if (!playerLeaving) return;

        this.players = this.players.filter(player => player.ws !== ws);
        console.log(`Player ${playerLeaving.id} left room ${this.id}. Current players: ${this.players.length}`);

        // 残ったプレイヤーに相手が退出したことを通知
        this.broadcast({
            type: 'playerLeft',
            playerId: playerLeaving.id,
            playerCount: this.players.length
        });

        // プレイヤーが0人になったらルームを削除
        if (this.players.length === 0) {
            rooms.delete(this.id);
            console.log(`Room ${this.id} deleted as it is empty.`);
        } else if (this.players.length === 1 && this.gameState.started) {
            // ゲーム中にプレイヤーが一人になったら、残ったプレイヤーを勝者としてゲーム終了
            const winner = this.players[0];
            this.broadcast({
                type: 'gameEnd',
                winner: winner.id,
                loser: playerLeaving.id,
                message: `${playerLeaving.id}が退出しました`
            }, winner.ws); // 勝者には送らない（勝者は自分のクライアントで表示する）
            winner.ws.send(JSON.stringify({
                type: 'gameEnd',
                winner: winner.id,
                loser: playerLeaving.id,
                message: `相手が退出しました。あなたの勝利！`
            }));
            this.gameState.started = false; // ゲーム状態をリセット
        }
    }
    
    // 全員にメッセージをブロードキャストする
    broadcast(message, excludeWs = null) {
        this.players.forEach(player => {
            if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
                player.ws.send(JSON.stringify(message));
            }
        });
    }
    
    handleMessage(ws, message) {
        const player = this.players.find(p => p.ws === ws);
        if (!player) return;
        
        switch (message.type) {
            case 'ready':
                player.ready = true;
                this.broadcast({
                    type: 'playerReady',
                    playerId: player.id
                });
                
                // 全員がreadyならゲーム開始
                if (this.players.length === 2 && this.players.every(p => p.ready)) {
                    this.startGame();
                }
                break;
                
            case 'boardUpdate':
                // プレイヤーのボード状態、スコア、レベル、HP、スキルゲージを更新
                const opponent = this.players.find(p => p.ws !== ws);
                if (!opponent) return; // 相手がいない場合は何もしない

                // サーバー側でプレイヤーのHPとスキルゲージの状態を更新（クライアントからの報告を受け入れる）
                // ただし、これらはサーバーで計算された最終的な値を使用する方が安全
                player.hp = message.hp;
                player.skillGauge = message.skillGauge;

                // 相手に更新を送信
                opponent.ws.send(JSON.stringify({
                    type: 'opponentUpdate',
                    board: message.board,
                    score: message.score,
                    level: message.level,
                    hp: player.hp, // 自分のHPを相手にとっての相手HPとして送信
                    skillGauge: player.skillGauge, // 自分のスキルゲージを相手にとっての相手スキルゲージとして送信
                    playerId: player.id,
                    character: player.character
                }));
                break;
                
            case 'linesCleared':
                if (message.lines > 0) {
                    const attackingPlayer = player;
                    const defendingPlayer = this.players.find(p => p.ws !== ws);

                    if (defendingPlayer) {
                        // 攻撃力計算（チェインブーストが発動している場合）
                        let actualAttackLines = message.lines; // クライアントが計算した攻撃ライン数
                        if (attackingPlayer.isSkillActive && attackingPlayer.character === 'char3') {
                             actualAttackLines = Math.ceil(actualAttackLines * attackingPlayer.char3AttackBoost);
                             console.log(`[Server] Player ${attackingPlayer.id} (Char3 Skill) boosted attack. Original: ${message.lines}, Boosted: ${actualAttackLines}`);
                        }
                        
                        // ダメージ計算（ダウンバリアが発動している場合）
                        let damageDealt = this._calculateDamage(defendingPlayer, actualAttackLines);

                        defendingPlayer.hp = Math.max(0, defendingPlayer.hp - damageDealt);
                        console.log(`[Server] Player ${defendingPlayer.id} HP: ${defendingPlayer.hp} (Damage: ${damageDealt})`);

                        // 攻撃を受ける側に攻撃通知
                        defendingPlayer.ws.send(JSON.stringify({
                            type: 'attack',
                            lines: damageDealt, // 適用されたダメージライン数
                            from: attackingPlayer.id,
                            attackType: message.attackType || 'ATTACK',
                            hp: defendingPlayer.hp // 攻撃を受けた側の最新HP
                        }));
                        
                        // 攻撃した側に、攻撃が成功したことを通知（任意だが、デバッグや演出に便利）
                        attackingPlayer.ws.send(JSON.stringify({
                            type: 'attackSentConfirmation', // 新しいメッセージタイプ
                            lines: actualAttackLines,
                            to: defendingPlayer.id,
                            attackType: message.attackType || 'ATTACK'
                        }));

                        // HPが0になったらゲーム終了
                        if (defendingPlayer.hp <= 0) {
                            this.endGame(attackingPlayer.id, defendingPlayer.id);
                        }
                    }
                }
                break;
                
            case 'gameOver':
                // クライアントからのゲームオーバー通知。勝者を特定し、全員にゲーム終了を通知
                const loserPlayer = player;
                const winnerPlayer = this.players.find(p => p.ws !== ws);
                if (winnerPlayer && loserPlayer) {
                    this.endGame(winnerPlayer.id, loserPlayer.id);
                } else {
                    console.warn(`Unexpected gameOver state. Winner: ${winnerPlayer?.id}, Loser: ${loserPlayer?.id}`);
                }
                break;

            case 'skillActivated':
                if (player.isSkillActive) {
                    console.warn(`Player ${player.id} tried to activate skill while already active.`);
                    return; // スキルが既に発動中の場合は無視
                }
                // クライアントから送られたスキルゲージが本当に満タンか、サーバー側で検証することも重要だが、
                // 今回はクライアントからの情報を受け入れる簡略化
                player.skillGauge = 0; // サーバー側でゲージを消費
                player.isSkillActive = true;
                
                // スキル効果の適用
                this._applySkillEffect(player, message.character);

                console.log(`[Server] Player ${player.id} activated skill: ${message.character}`);
                // 相手にスキル発動を通知
                this.broadcast({
                    type: 'skillActivated',
                    playerId: player.id,
                    character: message.character
                }, ws); // 自分自身には送らない（クライアント側で処理済みのため）

                // スキル持続時間後にスキルを非アクティブ化
                if (player.skillTimeoutId) {
                    clearTimeout(player.skillTimeoutId);
                }
                player.skillTimeoutId = setTimeout(() => {
                    this._deactivateSkillEffect(player, message.character);
                    console.log(`[Server] Player ${player.id}'s skill (${message.character}) deactivated.`);
                    // 相手にスキル終了を通知（オプション）
                    this.broadcast({
                        type: 'skillDeactivated', // 新しいメッセージタイプ
                        playerId: player.id,
                        character: message.character
                    }, ws);
                }, this.skillDuration);
                break;

            case 'rematchReady':
                this.rematchReady[player.id] = true;
                console.log(`Player ${player.id} is ready for rematch in room ${this.id}`);
                // 両方がrematchReadyなら再戦開始
                if (
                    this.players.length === 2 &&
                    this.rematchReady[this.players[0].id] &&
                    this.rematchReady[this.players[1].id]
                ) {
                    this.players.forEach(p => {
                        p.ready = false; // ready状態をリセット
                        p.hp = this.maxHp; // HPを初期化
                        p.skillGauge = 0; // スキルゲージも初期化
                        p.isSkillActive = false; // スキル状態をリセット
                        p.char3AttackBoost = 1.0;
                        p.lastStandUsed = false;
                        if(p.skillTimeoutId) clearTimeout(p.skillTimeoutId);
                        p.skillTimeoutId = null;
                    });
                    this.rematchReady = {}; // rematchReady状態をリセット
                    this.broadcast({ type: 'gameStart', timestamp: Date.now() }); // ゲーム開始メッセージを再送
                    console.log(`Rematch starting for room ${this.id}`);
                }
                break;

            case 'leaveRoom': // クライアントが明示的にルームを離れる場合
                // removePlayer が呼ばれるため、ここでは追加の処理は不要だが、
                // 安全のためデータベースからの削除もここに記述できる
                console.log(`Player ${player.id} explicitly leaving room ${this.id}.`);
                this.removePlayer(ws);
                break;
        }
    }
    
    startGame() {
        this.gameState.started = true;
        this.players.forEach(p => {
            p.ready = false; // ready状態をリセット
            p.hp = this.maxHp; // HPを初期化
            p.skillGauge = 0; // スキルゲージを初期化
            p.isSkillActive = false;
            p.char3AttackBoost = 1.0;
            p.lastStandUsed = false;
            if(p.skillTimeoutId) clearTimeout(p.skillTimeoutId);
            p.skillTimeoutId = null;
        });
        this.broadcast({
            type: 'gameStart',
            timestamp: Date.now()
        });
        console.log(`Game started for room ${this.id}`);
    }

    endGame(winnerId, loserId) {
        this.gameState.started = false;
        this.broadcast({
            type: 'gameEnd',
            winner: winnerId,
            loser: loserId
        });
        console.log(`Game ended in room ${this.id}. Winner: ${winnerId}, Loser: ${loserId}`);
    }

    /**
     * @function _applySkillEffect
     * @description Applies the specified character's skill effect on the server side.
     * @param {object} player - The player object whose skill is activated.
     * @param {string} character - The character ID of the skill activated.
     */
    _applySkillEffect(player, character) {
        switch (character) {
            case 'char1': // ヒールリンク：HPを回復
                const healAmount = Math.floor(this.maxHp * 0.3); // クライアントと同じ計算
                player.hp = Math.min(this.maxHp, player.hp + healAmount);
                console.log(`[Server] Player ${player.id} (Heal Link) healed for ${healAmount}. Current HP: ${player.hp}`);
                // 相手にもHP更新を通知
                this.broadcast({
                    type: 'opponentUpdate',
                    playerId: player.id,
                    hp: player.hp
                }, player.ws);
                break;
            case 'char2': // ダウンバリア：ダメージ20%カット (addAttackLinesで適用される)
                console.log(`[Server] Player ${player.id} (Down Barrier) active. Damage reduction will be applied.`);
                // 特にプレイヤーオブジェクトに状態を保持する必要はない。isSkillActiveがtrueであれば良い
                break;
            case 'char3': // チェインブースト：攻撃力1.5倍 + ラストスタンド
                player.char3AttackBoost = 1.5; // 攻撃力補正を設定
                player.lastStandUsed = false; // ラストスタンドのフラグをリセット
                console.log(`[Server] Player ${player.id} (Chain Boost) active. Attack boost: ${player.char3AttackBoost}, Last Stand reset.`);
                break;
        }
    }

    /**
     * @function _deactivateSkillEffect
     * @description Deactivates the specified character's skill effect on the server side.
     * @param {object} player - The player object whose skill is deactivated.
     * @param {string} character - The character ID of the skill deactivated.
     */
    _deactivateSkillEffect(player, character) {
        player.isSkillActive = false;
        player.char3AttackBoost = 1.0; // ChainBoostの効果をリセット
        // lastStandUsedは一度使われたらリセットされない、またはスキル発動時にリセットされるため、ここでリセットは不要
        // player.lastStandUsed = false; 

        if (player.skillTimeoutId) {
            clearTimeout(player.skillTimeoutId);
            player.skillTimeoutId = null;
        }
        console.log(`[Server] Player ${player.id} skill (${character}) deactivated.`);
    }

    /**
     * @function _calculateDamage
     * @description Calculates the actual damage dealt to a player, considering their character's abilities.
     * @param {object} defendingPlayer - The player object receiving damage.
     * @param {number} incomingDamage - The base damage amount.
     * @returns {number} The actual damage to be applied.
     */
    _calculateDamage(defendingPlayer, incomingDamage) {
        let actualDamage = incomingDamage;

        // キャラクター能力: Char2 (ダウンバリア)
        if (defendingPlayer.character === 'char2' && defendingPlayer.isSkillActive && defendingPlayer.hp <= this.maxHp * 0.5) {
            actualDamage = Math.ceil(incomingDamage * 0.8); // 20%ダメージカット
            console.log(`[Server] Down Barrier for ${defendingPlayer.id}: Incoming ${incomingDamage}, Reduced to ${actualDamage}`);
        }

        // キャラクター能力: Char3 (ラストスタンド)
        if (defendingPlayer.character === 'char3' && defendingPlayer.isSkillActive && defendingPlayer.hp === 1 && actualDamage >= 1 && !defendingPlayer.lastStandUsed) {
            defendingPlayer.lastStandUsed = true; // ラストスタンド使用済み
            actualDamage = 0; // 致死ダメージを無効化
            this._deactivateSkillEffect(defendingPlayer, defendingPlayer.character); // スキルを終了させる
            console.log(`[Server] Last Stand activated for ${defendingPlayer.id}: Damage negated!`);
        }

        return actualDamage;
    }
}


// ルーム管理
const rooms = new Map();
let roomIdCounter = 1; // ルームIDの自動生成用カウンター

wss.on('connection', (ws) => {
    console.log('新しいクライアントが接続しました');
    
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`Received message from client (${ws.playerId || 'unknown'}):`, message.type);
            
            switch (message.type) {
                case 'joinRoom':
                    // ルームIDが指定されていなければ新しいルームを作成
                    const targetRoomId = message.roomId || `room_${roomIdCounter++}`;
                    let room = rooms.get(targetRoomId);

                    if (!room) {
                        room = new GameRoom(targetRoomId);
                        rooms.set(room.id, room);
                        console.log(`Created new room: ${room.id}`);
                    }
                    
                    if (room.addPlayer(ws, message.playerId, message.character)) {
                        ws.room = room; // WebSocketオブジェクトにルーム参照を保存
                        ws.playerId = message.playerId; // WebSocketオブジェクトにプレイヤーIDを保存
                        // APIサーバーへの通知は、クライアントが直接行うことを想定しているため、サーバーからは呼び出さない。
                        // もしサーバーから呼ぶ場合は、`await fetch` のURLを適切に設定する必要がある。
                        // await fetch(`http://localhost:${PORT}/api/rooms/${room.id}/join`, { ... });
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'ルームが満員です'
                        }));
                    }
                    break;
                    
                default:
                    // ルームに所属していれば、ルームハンドラにメッセージを渡す
                    if (ws.room) {
                        ws.room.handleMessage(ws, message);
                    } else {
                        console.warn(`Message of type ${message.type} received from unassigned client.`);
                    }
                    break;
            }
        } catch (error) {
            console.error('メッセージ処理エラー:', error);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', message: 'サーバーでのメッセージ処理エラー' }));
            }
        }
    });
    
    ws.on('close', async () => {
        console.log(`クライアントが切断しました: ${ws.playerId || '不明'}`);
        if (ws.room) {
            const roomId = ws.room.id;
            const playerId = ws.playerId;
            ws.room.removePlayer(ws); // ルームからプレイヤーを削除
            
            // APIサーバーへの通知はクライアントが明示的に行うことを想定しているため、サーバーからは呼び出さない
            // または、サーバー側で強制的に削除APIを呼び出すロジックを追加する
            // if (playerId && roomId) {
            //     await fetch(`http://localhost:${PORT}/api/rooms/${roomId}/leave`, {
            //         method: 'POST',
            //         headers: { 'Content-Type': 'application/json' },
            //         body: JSON.stringify({ userId: playerId })
            //     });
            // }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocketエラー:', error);
        // エラー発生時にもクリーンアップを試みる
        if (ws.room) {
            ws.room.removePlayer(ws);
        }
    });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`サーバーがポート${PORT}で起動しました.`);
    console.log(`http://localhost:${PORT} でアクセスできます`);
});