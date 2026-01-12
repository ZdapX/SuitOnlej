
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Kirim daftar room publik ke user yang baru konek
    socket.emit('update-room-list', Object.values(rooms).filter(r => !r.isPrivate && r.players.length < 2));

    socket.on('create-room', ({ playerName, isPrivate }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = {
            code: roomCode,
            ownerId: socket.id,
            players: [{ id: socket.id, name: playerName, move: null }],
            isPrivate: isPrivate,
            status: 'waiting'
        };
        socket.join(roomCode);
        socket.emit('room-created', rooms[roomCode]);
        io.emit('update-room-list', Object.values(rooms).filter(r => !r.isPrivate && r.players.length < 2));
    });

    socket.on('join-room', ({ playerName, roomCode }) => {
        const room = rooms[roomCode];
        if (room && room.players.length < 2) {
            room.players.push({ id: socket.id, name: playerName, move: null });
            socket.join(roomCode);
            
            // Notifikasi ke owner
            io.to(room.ownerId).emit('notification', `${playerName} bergabung ke room!`);
            
            io.to(roomCode).emit('player-joined', room);
            io.emit('update-room-list', Object.values(rooms).filter(r => !r.isPrivate && r.players.length < 2));
        } else {
            socket.emit('error-msg', 'Room penuh atau tidak ditemukan');
        }
    });

    socket.on('make-move', ({ roomCode, move }) => {
        const room = rooms[roomCode];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) player.move = move;

        // Cek jika kedua pemain sudah pilih
        if (room.players.length === 2 && room.players[0].move && room.players[1].move) {
            io.to(roomCode).emit('game-result', room.players);
            // Reset move
            room.players.forEach(p => p.move = null);
        }
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
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) {
                delete rooms[code];
            } else {
                if (rooms[code].ownerId === socket.id) {
                    rooms[code].ownerId = rooms[code].players[0].id;
                }
                io.to(code).emit('player-joined', rooms[code]);
            }
        }
        io.emit('update-room-list', Object.values(rooms).filter(r => !r.isPrivate && r.players.length < 2));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
