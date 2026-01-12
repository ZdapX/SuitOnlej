
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => { res.render('index'); });

let rooms = {};

io.on('connection', (socket) => {
    socket.emit('update-room-list', Object.values(rooms).filter(r => r.players.length < 2));

    socket.on('create-room', ({ playerName }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = {
            code: roomCode,
            ownerId: socket.id,
            players: [{ id: socket.id, name: playerName, move: null, score: 0 }]
        };
        socket.join(roomCode);
        socket.emit('room-created', rooms[roomCode]);
        io.emit('update-room-list', Object.values(rooms).filter(r => r.players.length < 2));
    });

    socket.on('join-room', ({ playerName, roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push({ id: socket.id, name: playerName, move: null, score: 0 });
            socket.join(roomCode);
            io.to(room.ownerId).emit('notification', `${playerName} joined!`);
            io.to(roomCode).emit('player-joined', room);
            io.emit('update-room-list', Object.values(rooms).filter(r => r.players.length < 2));
        } else {
            socket.emit('error-msg', 'Room penuh atau tidak ditemukan');
        }
    });

    socket.on('make-move', ({ roomCode, move }) => {
        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.move = move;
            // Beritahu lawan kalau kita sudah milih
            socket.to(roomCode).emit('opponent-has-moved');
        }

        // CEK APAKAH KEDUA PEMAIN SUDAH MEMILIH
        const p1 = room.players[0];
        const p2 = room.players[1];

        if (p1 && p2 && p1.move && p2.move) {
            // Logika Menang
            if (p1.move !== p2.move) {
                if (
                    (p1.move === 'rock' && p2.move === 'scissors') ||
                    (p1.move === 'paper' && p2.move === 'rock') ||
                    (p1.move === 'scissors' && p2.move === 'paper')
                ) { p1.score++; } else { p2.score++; }
            }
            
            // Kirim hasil ke semua orang di room
            io.to(roomCode).emit('game-result', { 
                players: JSON.parse(JSON.stringify(room.players)) 
            });

            // Reset move untuk ronde berikutnya
            p1.move = null;
            p2.move = null;
        }
    });

    socket.on('send-chat', ({ roomCode, message, sender }) => {
        // Kirim ke semua orang di room (termasuk pengirim)
        io.to(roomCode).emit('receive-chat', { message, sender });
    });

    socket.on('kick-player', ({ roomCode, playerId }) => {
        const room = rooms[roomCode];
        if (room && room.ownerId === socket.id) {
            io.to(playerId).emit('kicked');
            room.players = room.players.filter(p => p.id !== playerId);
            io.to(roomCode).emit('player-joined', room);
        }
    });

    socket.on('disconnect', () => {
        for (const code in rooms) {
            const room = rooms[code];
            const pIndex = room.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                room.players.splice(pIndex, 1);
                if (room.players.length === 0) {
                    delete rooms[code];
                } else {
                    if (room.ownerId === socket.id) room.ownerId = room.players[0].id;
                    io.to(code).emit('player-joined', room);
                }
            }
        }
        io.emit('update-room-list', Object.values(rooms).filter(r => r.players.length < 2));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
