
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.render('index');
});

let rooms = {};

io.on('connection', (socket) => {
    socket.emit('update-room-list', Object.values(rooms).filter(r => r.players.length < 2));

    socket.on('create-room', ({ playerName }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = {
            code: roomCode,
            ownerId: socket.id,
            players: [{ id: socket.id, name: playerName, move: null, score: 0 }],
            status: 'waiting'
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

        const pIdx = room.players.findIndex(p => p.id === socket.id);
        if (pIdx !== -1) {
            room.players[pIdx].move = move;
            socket.to(roomCode).emit('opponent-moved');
        }

        if (room.players.length === 2 && room.players[0].move && room.players[1].move) {
            const p1 = room.players[0];
            const p2 = room.players[1];

            // Logic Win
            if (p1.move !== p2.move) {
                if (
                    (p1.move === 'rock' && p2.move === 'scissors') ||
                    (p1.move === 'paper' && p2.move === 'rock') ||
                    (p1.move === 'scissors' && p2.move === 'paper')
                ) { p1.score++; } else { p2.score++; }
            }
            
            io.to(roomCode).emit('game-result', { players: room.players });
            // Reset moves
            room.players.forEach(p => p.move = null);
        }
    });

    socket.on('send-chat', ({ roomCode, message, sender }) => {
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
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[code];
            } else {
                if (room.ownerId === socket.id) room.ownerId = room.players[0].id;
                io.to(code).emit('player-joined', room);
            }
        }
        io.emit('update-room-list', Object.values(rooms).filter(r => r.players.length < 2));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
