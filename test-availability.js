// test-availability.js — Pengujian Availability Sistem (NFR-01)
// Menjalankan 3 SESI berturut-turut dalam satu proses (start sekali, tinggalkan).
// Memantau /health berkala, mencatat downtime, hitung A = (T_total - T_down)/T_total × 100%.
//
// Jalankan (argumen = jam per sesi):
//   node test-availability.js 6      → 3 sesi × 6 jam = 18 jam total
//   node test-availability.js 8      → 3 sesi × 8 jam = 24 jam total
// Hentikan: Ctrl+C → ringkasan sesi yang sudah selesai tetap tercetak.
const https = require('https');
const fs = require('fs');

const HEALTH_URL  = 'https://vts-backend-testing.up.railway.app/health';
const INTERVAL_MS = 60 * 1000;   // cek tiap 60 detik
const REQ_TIMEOUT = 10000;       // DOWN jika tak respons dalam 10 detik
const JAM_PER_SESI = parseFloat(process.argv[2]) || 7;
const JUMLAH_SESI  = 3;
const LOG_FILE     = 'availability-log.csv';

const hasilSesi = [];

function cekHealth() {
  return new Promise((resolve) => {
    const req = https.get(HEALTH_URL, { timeout: REQ_TIMEOUT }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode === 200));
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error',   () => resolve(false));
  });
}

const fmt = (d) => new Date(d).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jalankanSesi(no) {
  let total = 0, down = 0;
  const start = Date.now();
  const end = start + JAM_PER_SESI * 3600 * 1000;
  fs.appendFileSync(LOG_FILE, `# Sesi ${no} mulai ${fmt(start)}\n`);

  while (Date.now() < end) {
    const up = await cekHealth();
    total++; if (!up) down++;
    fs.appendFileSync(LOG_FILE, `${fmt(Date.now())},sesi${no},${up ? 'UP' : 'DOWN'}\n`);
    const dMenit = total * INTERVAL_MS / 60000;
    const dtMenit = down * INTERVAL_MS / 60000;
    const avail = (dMenit - dtMenit) / dMenit * 100;
    process.stdout.write(`\r[Sesi ${no}] cek=${total} UP=${total - down} DOWN=${down} | durasi=${dMenit.toFixed(0)}m | avail=${avail.toFixed(3)}%   `);
    await sleep(INTERVAL_MS);
  }

  const durasiMenit = total * INTERVAL_MS / 60000;
  const downMenit = down * INTERVAL_MS / 60000;
  const avail = (durasiMenit - downMenit) / durasiMenit * 100;
  hasilSesi.push({ no, durasiMenit, downMenit, avail });
  console.log(`\n✓ Sesi ${no} selesai → durasi=${durasiMenit.toFixed(0)}m | downtime=${downMenit.toFixed(0)}m | avail=${avail.toFixed(3)}%\n`);
}

function cetakTabel() {
  if (hasilSesi.length === 0) { console.log('\n(Belum ada sesi yang selesai.)'); return; }
  console.log('\n══════════ HASIL NFR-01 ══════════');
  let sD = 0, sDt = 0, sA = 0;
  for (const h of hasilSesi) {
    console.log(`  Sesi ${h.no} | Durasi ${h.durasiMenit.toFixed(0)}m | Downtime ${h.downMenit.toFixed(0)}m | Avail ${h.avail.toFixed(3)}% | ${h.avail >= 99.5 ? 'Berhasil' : 'Gagal'}`);
    sD += h.durasiMenit; sDt += h.downMenit; sA += h.avail;
  }
  const n = hasilSesi.length;
  console.log(`  Rata-rata | Durasi ${(sD / n).toFixed(0)}m | Downtime ${(sDt / n).toFixed(1)}m | Avail ${(sA / n).toFixed(3)}%`);
  console.log('══════════════════════════════════\n');
}

process.on('SIGINT', () => { console.log('\n[Dihentikan manual]'); cetakTabel(); process.exit(0); });

(async () => {
  console.log(`Uji Availability NFR-01 — ${JUMLAH_SESI} sesi × ${JAM_PER_SESI} jam (total ${(JUMLAH_SESI * JAM_PER_SESI)} jam)`);
  console.log(`Target : ${HEALTH_URL}`);
  console.log(`Mulai  : ${fmt(Date.now())} | cek tiap ${INTERVAL_MS / 1000}s\n`);
  for (let i = 1; i <= JUMLAH_SESI; i++) await jalankanSesi(i);
  cetakTabel();
  process.exit(0);
})();
