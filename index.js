const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

let games = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('create-game', (playerName) => {
    const gameId = Math.random().toString(36).substring(2, 8);
    games[gameId] = {
      creator: { id: socket.id, name: playerName, choice: null },
      opponent: null,
      status: 'waiting'
    };
    socket.join(gameId);
    socket.emit('game-created', { gameId, playerName });
    io.emit('game-list', Object.keys(games).filter(id => games[id].status === 'waiting'));
  });

  socket.on('join-game', ({ gameId, playerName }) => {
    if (games[gameId] && games[gameId].status === 'waiting') {
      games[gameId].opponent = { id: socket.id, name: playerName, choice: null };
      games[gameId].status = 'ready';
      socket.join(gameId);
      io.to(gameId).emit('game-started', {
        gameId,
        creator: games[gameId].creator.name,
        opponent: playerName
      });
      io.emit('game-list', Object.keys(games).filter(id => games[id].status === 'waiting'));
    } else {
      socket.emit('error', 'Game not available');
    }
  });

  socket.on('make-choice', ({ gameId, choice }) => {
    if (!games[gameId]) return;
    const player = games[gameId].creator.id === socket.id ? 'creator' : 'opponent';
    games[gameId][player].choice = choice;

    if (games[gameId].creator.choice && games[gameId].opponent.choice) {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      const winner = games[gameId].creator.choice === result ? games[gameId].creator.name :
                     games[gameId].opponent.choice === result ? games[gameId].opponent.name : null;
      io.to(gameId).emit('game-result', {
        result,
        winner,
        creatorChoice: games[gameId].creator.choice,
        opponentChoice: games[gameId].opponent.choice
      });
      delete games[gameId];
      io.emit('game-list', Object.keys(games).filter(id => games[id].status === 'waiting'));
    }
  });

  socket.on('get-game-list', () => {
    socket.emit('game-list', Object.keys(games).filter(id => games[id].status === 'waiting'));
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const gameId in games) {
      if (games[gameId].creator.id === socket.id || (games[gameId].opponent && games[gameId].opponent.id === socket.id)) {
        io.to(gameId).emit('error', 'Opponent disconnected');
        delete games[gameId];
      }
    }
    io.emit('game-list', Object.keys(games).filter(id => games[id].status === 'waiting'));
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
