// test-ws.js — Pengujian keamanan WebSocket (NFR-06)
// Jalankan: node test-ws.js
const { io } = require('socket.io-client');

const URL = 'https://vts-backend-testing.up.railway.app';

// Token admin (dari hasil login). Ganti kalau sudah kadaluarsa.
const ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkB2dHMuY29tIiwicm9sZSI6ImFkbWluIiwibmFtYSI6IkFkbWluIFZUUyIsImlhdCI6MTc4MTQzMDg5OSwiZXhwIjoxNzgxNTE3Mjk5fQ.vbu0eUCfVquX78-9IMyNdJNu5WXe0zv-0b-cGqTUQAA';

// Helper: coba connect, laporkan hasil, lalu tutup
function uji({ nama, auth }) {
  return new Promise((resolve) => {
    const socket = io(URL, {
      auth,
      transports: ['websocket'],
      reconnection: false,
      timeout: 8000,
    });

    socket.on('connect', () => {
      console.log(`\n[${nama}]`);
      console.log(`  ✅ Koneksi DITERIMA  (socket id: ${socket.id})`);
      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (err) => {
      console.log(`\n[${nama}]`);
      console.log(`  ❌ Koneksi DITOLAK  (alasan: ${err.message})`);
      resolve();
    });
  });
}

(async () => {
  console.log('=== Pengujian WebSocket VTS ===');
  console.log('Target:', URL);

  // Skenario A: connect TANPA token  → harap diterima, role = pelanggan
  await uji({ nama: 'A. Connect TANPA token (pelanggan)', auth: {} });

  // Skenario B: connect DENGAN token admin → harap diterima, join admin_room
  await uji({ nama: 'B. Connect DENGAN token admin', auth: { token: ADMIN_TOKEN } });

  // (Opsional) Skenario C: token ngawur → harap ditolak
  await uji({ nama: 'C. Connect token TIDAK VALID', auth: { token: 'token-ngawur-123' } });

  console.log('\n=== Selesai. Cek juga LOG server di Railway untuk konfirmasi role & room ===');
  process.exit(0);
})();
