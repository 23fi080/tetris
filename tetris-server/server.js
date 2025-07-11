// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
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

app.use('/tetris-server', express.static(path.join(__dirname, 'tetris-server')));

// APIルーティング
app.post('/api/rooms/:roomId/join', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.body;
    await pool.query(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roomId, userId]
    );
    res.sendStatus(200);
});

app.post('/api/rooms/:roomId/leave', async (req, res) => {
    const { roomId } = req.params;
    const { userId } = req.body;
    await pool.query(
        'DELETE FROM room_members WHERE room_id = $1 AND user_id = $2',
        [roomId, userId]
    );
    res.sendStatus(200);
});

app.get('/api/rooms/:roomId/members', async (req, res) => {
    const { roomId } = req.params;
    const result = await pool.query(
        'SELECT user_id FROM room_members WHERE room_id = $1',
        [roomId]
    );
    res.json(result.rows.map(row => row.user_id));
});

// サーバー・WebSocketサーバーの統合
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ゲームルーム管理
class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.gameState = {
            started: false,
            board1: Array(20).fill().map(() => Array(10).fill(0)),
            board2: Array(20).fill().map(() => Array(10).fill(0)),
            scores: [0, 0],
            levels: [1, 1]
        };
        this.rematchReady = {};
    }
    
    // GameRoomクラスの addPlayer メソッドを、この内容に丸ごと置き換えてください
    addPlayer(ws, playerId, character) {
        if (this.players.length >= 2) {
            return false;
        }

        const newPlayer = {
            ws: ws,
            id: playerId,
            character: character,
            ready: false,
            hp: 10 // HPを初期化
        };

        // 既存のプレイヤーに、新しいプレイヤーの参加を通知
        this.broadcast({
            type: 'playerJoined',
            player: { id: newPlayer.id, ready: newPlayer.ready, character: newPlayer.character }
        });

        this.players.push(newPlayer);

        // 新しく参加したプレイヤーに、現在のルーム情報を送信
        ws.send(JSON.stringify({
            type: 'joined',
            playerId: newPlayer.id,
            room: {
                players: this.players.map(p => ({ id: p.id, ready: p.ready, character: p.character })),
                playerCount: this.players.length
            }
        }));
        
        return true;
    }
    
    removePlayer(ws) {
        this.players = this.players.filter(player => player.ws !== ws);
        this.broadcast({
            type: 'playerLeft',
            playerCount: this.players.length
        });
    }
    
    broadcast(message, exclude = null) {
        this.players.forEach(player => {
            if (player.ws !== exclude && player.ws.readyState === WebSocket.OPEN) {
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
                // プレイヤーのボード状態を更新
                const playerIndex = this.players.indexOf(player);
                if (playerIndex === 0) {
                    this.gameState.board1 = message.board;
                    this.gameState.scores[0] = message.score;
                    this.gameState.levels[0] = message.level;
                } else {
                    this.gameState.board2 = message.board;
                    this.gameState.scores[1] = message.score;
                    this.gameState.levels[1] = message.level;
                }
                
                // プレイヤーのHPも更新
                if (message.hp !== undefined) {
                    player.hp = message.hp;
                }

                // 相手に更新を送信
                this.players.forEach((p, idx) => {
                    if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
                        p.ws.send(JSON.stringify({
                            type: 'opponentUpdate',
                            board: message.board,
                            score: message.score,
                            level: message.level,
                            hp: message.hp, // HP情報を追加
                            playerId: player.id,
                            character: player.character
                        }));
                    }
                });
                break;
                
            case 'linesCleared':
                // 攻撃ライン送信
                if (message.lines > 0) { // 0より大きい場合のみ送信
                    // 攻撃を受ける側のプレイヤーを特定
                    const targetPlayer = this.players.find(p => p.ws !== ws);
                    if (targetPlayer) {
                        // 攻撃を受ける側のHPを計算（簡易的な実装）
                        // 実際のゲームでは、キャラクター能力によるダメージ軽減などを考慮する必要があります
                        const targetHp = Math.max(0, (targetPlayer.hp || 10) - message.lines);
                        targetPlayer.hp = targetHp;
                        
                        this.broadcast({
                            type: 'attack',
                            lines: message.lines, // クライアントから送られた値をそのまま使う
                            from: player.id,
                            attackType: message.attackType || 'ATTACK', // クライアントから攻撃タイプを受け取る
                            hp: targetHp // 攻撃を受けた側のHPを送信
                        }, ws);
                    }
                }
                break;
                
            case 'gameOver':
                this.broadcast({
                    type: 'gameEnd',
                    winner: this.players.find(p => p.ws !== ws).id,
                    loser: player.id
                });
                break;

            case 'rematchReady':
                this.rematchReady[player.id] = true;
                // 両方がrematchReadyなら再戦開始
                if (
                    this.players.length === 2 &&
                    this.rematchReady[this.players[0].id] &&
                    this.rematchReady[this.players[1].id]
                ) {
                    // rematchReady状態をリセット
                    this.rematchReady = {};
                    this.broadcast({ type: 'rematchStart' });
                }
                break;
        }
    }
    
    startGame() {
        this.gameState.started = true;
        this.broadcast({
            type: 'gameStart',
            timestamp: Date.now()
        });
    }
}

// ルーム管理
const rooms = new Map();
let roomIdCounter = 1;

wss.on('connection', (ws) => {
    console.log('新しいクライアントが接続しました');
    
    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            
            switch (message.type) {
                case 'joinRoom':
                    let room = rooms.get(message.roomId);
                    if (!room) {
                        room = new GameRoom(message.roomId || `room_${roomIdCounter++}`);
                        rooms.set(room.id, room);
                    }
                    
                    if (room.addPlayer(ws, message.playerId, message.character)) {
                        ws.room = room;
                        ws.playerId = message.playerId;
                        console.log(`ルーム${room.id}の人数: ${rooms.get(room.id).players.length}`);
                        // ルーム参加APIを呼ぶ（相対パスでOK！）
                        await fetch(`http://localhost:${PORT}/api/rooms/${message.roomId}/join`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: message.playerId })
                        });
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'ルームが満員です'
                        }));
                    }
                    break;
                    
                default:
                    if (ws.room) {
                        ws.room.handleMessage(ws, message);
                    }
                    break;
            }
        } catch (error) {
            console.error('メッセージ処理エラー:', error);
        }
    });
    
    ws.on('close', async () => {
        console.log('クライアントが切断しました');
        if (ws.room) {
            ws.room.removePlayer(ws);
            if (ws.room.players.length === 0) {
                rooms.delete(ws.room.id);
            }
            // ルーム退出APIを呼ぶ
            await fetch(`http://localhost:${PORT}/api/rooms/${ws.room.id}/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: ws.playerId })
            });
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocketエラー:', error);
    });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`サーバーがポート${PORT}で起動しました.`);
    console.log(`http://localhost:${PORT} でアクセスできます`);
});