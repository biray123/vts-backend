// test-fr03.js — Pengujian Dashboard Real-time (FR-03)
// Mengukur waktu update dashboard: t1 (server terima) → t2 (browser update)
// Δt = t2 - t1. Memakai jalur produksi yang sama (broker.hivemq.com → backend Railway → WS).
//
// Prasyarat: trip 'berjalan' (jalankan setup-latensi.js dulu).
// Jalankan: node test-fr03.js
require('dotenv').config();
const mqtt = require('mqtt');
const { io } = require('socket.io-client');

const WS_URL     = 'https://vts-backend-testing.up.railway.app';
const BROKER_URL = 'mqtt://broker.hivemq.com:1883'; // sama dengan backend Railway
const TRUCK_ID   = 'TRUCK-001';
const TOPIC      = `vts/telemetry/${TRUCK_ID}`;
const TRIP_ID    = 14;        // ← samakan dengan setup-latensi.js
const JUMLAH_UJI = 5;
const JEDA_MS    = 2000;
const AMBANG_MS  = 2000;      // Δt ≤ ambang → real-time OK

const ALL_EPC = [
  'E28069150000700F0CA6BA45','E28069150000600F0CA6D245','E28069150000600F0CA6C645',
  'E28069150000600F0CA6E245','E28069150000700F0CA6C245','E28069150000600F0CA6DE45',
  'E28069150000700F0CA6EA45','E28069150000700F0CA6D645','E28069150000700F0CA6CE45',
  'E28069150000600F0CA6BE45','E28069150000600F0CA6CA45','E28069150000700F0CA6DA45',
  'E28069150000600F0CA6EE45','E28069150000700F0CA6E645','E28069150000600F0CA6F645',
  'E28069150000700F0CA6F245','E28069150000600F0CA6FA45','E28069150000700F0CA6FE45',
  'E28069150000700F0CA70645','E28069150000600F0CA70245',
];

const hasil = [];
let pending = null;
let currentT0 = 0; // waktu publish pengukuran yang sedang berjalan (acuan ms relatif)

const socket = io(WS_URL, { transports: ['websocket'], reconnection: false });
socket.on('connect', () => { console.log('[WS] Dashboard terhubung:', socket.id); socket.emit('join_trip', { trip_id: TRIP_ID }); });
socket.on('connect_error', (e) => { console.error('[WS] Gagal konek:', e.message); process.exit(1); });

socket.on('telemetry_update', (payload) => {
  const t2abs = Date.now();                  // browser update (epoch)
  if (!pending || payload.server_received_ms == null) return;
  const t1abs = payload.server_received_ms;  // server terima (epoch)
  // Tampilkan sebagai ms relatif sejak data dikirim (t0). Δt = t2 - t1 tetap akurat.
  const r = { t1: t1abs - currentT0, t2: t2abs - currentT0, dt: t2abs - t1abs };
  const done = pending; pending = null;
  done(r);
});

const mqttClient = mqtt.connect(BROKER_URL, { clientId: `vts-fr03-test-${Date.now()}` });
mqttClient.on('error', (e) => { console.error('[MQTT] Error:', e.message); process.exit(1); });

function ukurSekali(no) {
  return new Promise((resolve) => {
    const sent_ms = Date.now();
    currentT0 = sent_ms;
    const payload = { id: TRUCK_ID, timestamp: new Date(sent_ms).toISOString(), sent_ms,
      gps: { lat: -6.9175, lon: 107.6191, speed: 40 }, detected_packages: ALL_EPC };
    const timeout = setTimeout(() => {
      if (pending) { pending = null; console.log(`  #${no}  TIMEOUT`); resolve(); }
    }, 10000);
    pending = (r) => {
      clearTimeout(timeout);
      hasil.push(r);
      const status = r.dt <= AMBANG_MS ? 'Berhasil' : 'Gagal';
      console.log(`  #${no}  t1=${r.t1}  t2=${r.t2}  Δt=${r.dt} ms  → ${status}`);
      resolve();
    };
    mqttClient.publish(TOPIC, JSON.stringify(payload), { qos: 1 });
  });
}

async function jalankan() {
  console.log(`\n=== FR-03 Dashboard Real-time — ${JUMLAH_UJI}x ===\n`);
  for (let i = 1; i <= JUMLAH_UJI; i++) {
    await ukurSekali(i);
    if (i < JUMLAH_UJI) await new Promise((r) => setTimeout(r, JEDA_MS));
  }
  if (hasil.length === 0) { console.log('\n⚠️ Tidak ada data — cek trip berjalan & broker.'); process.exit(1); }
  const avgDt = Math.round(hasil.reduce((s, r) => s + r.dt, 0) / hasil.length);
  console.log('\n──────────────────────────────────────');
  console.log(`RATA-RATA Δt : ${avgDt} ms  → ${avgDt <= AMBANG_MS ? '✅ Berhasil' : '❌ Gagal'}`);
  console.log('──────────────────────────────────────\n');
  mqttClient.end(); socket.disconnect(); process.exit(0);
}

let ready = 0;
const start = () => { if (++ready === 2) setTimeout(jalankan, 1500); };
socket.on('connect', start);
mqttClient.on('connect', () => { console.log('[MQTT] terhubung ke broker'); start(); });
