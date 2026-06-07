// src/socket/socketHandler.js
const jwt = require('jsonwebtoken');

function initSocket(io) {
  // Middleware autentikasi WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    // Pelanggan boleh connect tanpa token (untuk tracking publik)
    if (!token) {
      socket.user = { role: 'pelanggan' };
      return next();
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('Token tidak valid'));
    }
  });

  io.on('connection', (socket) => {
    const role = socket.user?.role || 'pelanggan';
    console.log(`[Socket] Client terhubung: ${socket.id} (${role})`);

    // Admin join room khusus admin untuk terima semua alert
    if (role === 'admin') {
      socket.join('admin_room');
      console.log(`[Socket] Admin ${socket.user.nama} join admin_room`);
    }

    // Join room monitoring trip tertentu
    // Client kirim: socket.emit('join_trip', { trip_id: 42 })
    socket.on('join_trip', ({ trip_id }) => {
      if (!trip_id) return;
      socket.join(`trip_${trip_id}`);
      console.log(`[Socket] ${socket.id} join trip_${trip_id}`);
    });

    socket.on('leave_trip', ({ trip_id }) => {
      socket.leave(`trip_${trip_id}`);
    });

    // Pelanggan tracking - join room paket spesifik
    // Client kirim: socket.emit('track_package', { kode_paket: 'PKG-001' })
    socket.on('track_package', ({ kode_paket }) => {
      if (!kode_paket) return;
      socket.join(`pkg_${kode_paket}`);
      console.log(`[Socket] ${socket.id} tracking paket: ${kode_paket}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnect: ${socket.id}`);
    });
  });

  return io;
}

module.exports = { initSocket };
