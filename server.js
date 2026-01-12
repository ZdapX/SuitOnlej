
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
    socket.emit('update-room-list', Object.values(rooms).filter(r => !r.isPrivate && r.players.length < 2));

    socket.on('create-room', ({ playerName, isPrivate }) => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomCode] = {
            code: roomCode,
            ownerId: socket.id,
            players: [{ id: socket.id, name: playerName, move: null }],
            isPrivate: isPrivate
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
            io.to(room.ownerId).emit('notification', `${playerName} bergabung!`);
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
        if (player) {
            player.move = move;
            // Beritahu lawan bahwa player ini sudah memilih
            socket.to(roomCode).emit('opponent-has-moved');
        }

        // Cek jika semua (2 orang) sudah pilih
        const readyPlayers = room.players.filter(p => p.move !== null);
        if (readyPlayers.length === 2) {
            // Kirim hasil ke semua orang di room tersebut
            io.to(roomCode).emit('game-result', room.players);
            
            // Reset move untuk ronde berikutnya
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
            const room = rooms[code];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                if (room.players.length === 0) {
                    delete rooms[code];
                } else {
                    if (room.ownerId === socket.id) room.ownerId = room.players[0].id;
                    io.to(code).emit('player-joined', room);
                }
            }
        }
        io.emit('update-room-list', Object.values(rooms).filter(r => !r.isPrivate && r.players.length < 2));
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
