import { WebSocketServer } from 'ws';

// Distinct shirt colors for players
const PLAYER_COLORS = [
  { name: 'Blu Classico', hex: '#1f8cd9', num: 0x1f8cd9 },
  { name: 'Rosso Cremisi', hex: '#e63946', num: 0xe63946 },
  { name: 'Verde Smeraldo', hex: '#2a9d8f', num: 0x2a9d8f },
  { name: 'Arancione Sole', hex: '#f4a261', num: 0xf4a261 },
  { name: 'Viola Notte', hex: '#9d4edd', num: 0x9d4edd },
  { name: 'Ciano Polare', hex: '#00b4d8', num: 0x00b4d8 },
  { name: 'Giallo Oro', hex: '#e9c46a', num: 0xe9c46a },
  { name: 'Rosa Neon', hex: '#ff4d6d', num: 0xff4d6d }
];

export function setupMultiplayerServer(httpServer) {
  // Prevent unhandled client socket errors on HTTP server from crashing the process
  httpServer.on('clientError', (err, socket) => {
    if (socket && !socket.destroyed) {
      socket.destroy();
    }
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  wss.on('error', (err) => {
    console.warn('[Multiplayer] WSS warning:', err?.message || err);
  });

  const clients = new Map();
  let playerCounter = 0;

  function broadcast(data, excludeWs = null) {
    const json = JSON.stringify(data);
    for (const [ws] of clients) {
      if (ws !== excludeWs && ws.readyState === 1 /* OPEN */) {
        try {
          ws.send(json);
        } catch (e) {}
      }
    }
  }

  wss.on('connection', (ws, req) => {
    // Protect against socket reset errors on raw TCP streams
    if (req && req.socket) {
      req.socket.on('error', () => {});
    }
    if (ws._socket) {
      ws._socket.on('error', () => {});
    }

    playerCounter++;
    const playerId = 'p_' + Math.random().toString(36).substring(2, 9);
    const colorIndex = (playerCounter - 1) % PLAYER_COLORS.length;
    const assignedColor = PLAYER_COLORS[colorIndex];
    const defaultName = `Giocatore ${playerCounter}`;

    const player = {
      id: playerId,
      name: defaultName,
      color: assignedColor,
      x: 0,
      y: 0,
      z: 0,
      facingAngle: 0,
      cameraPitch: 0,
      isMoving: false,
      isSprinting: false,
      isGrounded: true,
      walkCycle: 0,
      isAiming: false,
      isAttacking: false,
      attackSide: 0,
      hp: 100,
      lastUpdate: Date.now()
    };

    clients.set(ws, player);
    console.log(`[Multiplayer] 🎮 ${player.name} (${player.id}) connesso! Colore: ${assignedColor.name}`);

    // Send welcome to new player with existing players list
    const existingPlayers = [];
    for (const [otherWs, otherPlayer] of clients) {
      if (otherWs !== ws) {
        existingPlayers.push({
          id: otherPlayer.id,
          name: otherPlayer.name,
          color: otherPlayer.color,
          x: otherPlayer.x,
          y: otherPlayer.y,
          z: otherPlayer.z,
          facingAngle: otherPlayer.facingAngle,
          cameraPitch: otherPlayer.cameraPitch,
          isMoving: otherPlayer.isMoving,
          isSprinting: otherPlayer.isSprinting,
          isGrounded: otherPlayer.isGrounded,
          isAiming: otherPlayer.isAiming,
          isAttacking: otherPlayer.isAttacking,
          hp: otherPlayer.hp
        });
      }
    }

    ws.send(JSON.stringify({
      type: 'welcome',
      id: player.id,
      name: player.name,
      color: player.color,
      isHost: clients.size === 1,
      players: existingPlayers,
      totalConnected: clients.size
    }));

    // Broadcast new player joined to everyone else
    broadcast({
      type: 'player_joined',
      player: {
        id: player.id,
        name: player.name,
        color: player.color,
        x: player.x,
        y: player.y,
        z: player.z,
        facingAngle: player.facingAngle,
        hp: player.hp
      },
      totalConnected: clients.size
    }, ws);

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.type) {
          case 'setName':
            if (msg.name && typeof msg.name === 'string') {
              player.name = msg.name.trim().substring(0, 16);
              broadcast({
                type: 'player_renamed',
                id: player.id,
                name: player.name
              });
            }
            break;

          case 'update':
            // Update local state
            player.x = msg.x ?? player.x;
            player.y = msg.y ?? player.y;
            player.z = msg.z ?? player.z;
            player.facingAngle = msg.facingAngle ?? player.facingAngle;
            player.cameraPitch = msg.cameraPitch ?? player.cameraPitch;
            player.isMoving = !!msg.isMoving;
            player.isSprinting = !!msg.isSprinting;
            player.isGrounded = msg.isGrounded !== undefined ? !!msg.isGrounded : player.isGrounded;
            player.walkCycle = msg.walkCycle ?? player.walkCycle;
            player.isAiming = !!msg.isAiming;
            player.isAttacking = !!msg.isAttacking;
            player.attackSide = msg.attackSide ?? 0;
            player.hp = msg.hp ?? player.hp;
            player.lastUpdate = Date.now();
            break;

          case 'shoot':
            // Broadcast bullet gunshot, tracer, and impact
            broadcast({
              type: 'player_shoot',
              id: player.id,
              from: msg.from,
              to: msg.to
            }, ws);
            break;

          case 'punch':
            // Broadcast melee strike
            broadcast({
              type: 'player_punch',
              id: player.id,
              side: msg.side
            }, ws);
            break;

          case 'zombie_hit':
            // Cooperative zombie damage
            broadcast({
              type: 'zombie_hit',
              shooterId: player.id,
              zombieIndex: msg.zombieIndex,
              damage: msg.damage,
              dirX: msg.dirX,
              dirZ: msg.dirZ
            });
            break;

          case 'zombies_sync':
            // Host sends authoritative zombie positions
            broadcast({
              type: 'zombies_sync',
              zombies: msg.zombies
            }, ws);
            break;
        }
      } catch (err) {
        console.error('[Multiplayer] Error parsing client message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[Multiplayer] 🔌 ${player.name} (${player.id}) disconnesso. Rimasti: ${clients.size}`);
      broadcast({
        type: 'player_left',
        id: player.id,
        name: player.name,
        totalConnected: clients.size
      });
    });

    ws.on('error', (err) => {
      console.error(`[Multiplayer] Socket error for ${player.id}:`, err);
    });
  });

  // State Broadcast Loop at 25Hz (every 40ms)
  setInterval(() => {
    if (clients.size <= 1) return;

    const snapshot = [];
    for (const [, p] of clients) {
      snapshot.push({
        id: p.id,
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        fA: Math.round(p.facingAngle * 100) / 100,
        cP: Math.round(p.cameraPitch * 100) / 100,
        m: p.isMoving ? 1 : 0,
        s: p.isSprinting ? 1 : 0,
        g: p.isGrounded ? 1 : 0,
        wc: Math.round(p.walkCycle * 100) / 100,
        aim: p.isAiming ? 1 : 0,
        atk: p.isAttacking ? 1 : 0,
        side: p.attackSide,
        hp: p.hp
      });
    }

    const payload = JSON.stringify({
      type: 'batch_update',
      players: snapshot
    });

    for (const [ws] of clients) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }, 40);

  console.log('[Multiplayer] 🚀 Server WebSocket pronto su path /ws (Porta 3000)');
  return wss;
}
