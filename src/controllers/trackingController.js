const { query } = require('../config/database');

// GET /api/tracking/:kode_paket - publik, pelanggan cek resi
async function trackPackage(req, res, next) {
  try {
    const { kode_paket } = req.params;

    // Cari paket
    const pkgRes = await query(
      `SELECT id, kode_paket, nama_penerima, alamat_tujuan, status_paket
       FROM package WHERE kode_paket = $1`,
      [kode_paket]
    );
    if (pkgRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Nomor resi tidak ditemukan' });
    }
    const pkg = pkgRes.rows[0];

    // Cari trip aktif yang membawa paket ini
    const tripRes = await query(
      `SELECT t.id AS trip_id, t.rute_asal, t.rute_tujuan, t.status_trip,
              tr.kode_truk, tr.nomor_polisi
       FROM trip t
       JOIN truck tr ON tr.id = t.truck_id
       JOIN manifest m ON m.id = t.manifest_id
       JOIN manifest_package mp ON mp.manifest_id = m.id
       WHERE mp.package_id = $1
         AND t.status_trip IN ('berjalan', 'persiapan')
       ORDER BY t.created_at DESC LIMIT 1`,
      [pkg.id]
    );

    if (tripRes.rows.length === 0) {
      // Tidak ada trip aktif - kembalikan status saja
      return res.json({
        success: true,
        data: {
          kode_paket: pkg.kode_paket,
          nama_penerima: pkg.nama_penerima,
          alamat_tujuan: pkg.alamat_tujuan,
          status_paket: pkg.status_paket,
          sedang_dalam_perjalanan: false,
          posisi_kendaraan: null,
        },
      });
    }

    const trip = tripRes.rows[0];

    // Posisi GPS kendaraan terakhir
    const gpsRes = await query(
      `SELECT latitude, longitude, kecepatan_kmh, timestamp
       FROM gps_log WHERE trip_id = $1
       ORDER BY timestamp DESC LIMIT 1`,
      [trip.trip_id]
    );

    // Status deteksi RFID terakhir untuk paket ini
    const rfidRes = await query(
      `SELECT is_detected, timestamp
       FROM rfid_event
       WHERE trip_id = $1 AND package_id = $2
       ORDER BY timestamp DESC LIMIT 1`,
      [trip.trip_id, pkg.id]
    );

    res.json({
      success: true,
      data: {
        kode_paket: pkg.kode_paket,
        nama_penerima: pkg.nama_penerima,
        alamat_tujuan: pkg.alamat_tujuan,
        status_paket: pkg.status_paket,
        sedang_dalam_perjalanan: true,
        rute: { dari: trip.rute_asal, ke: trip.rute_tujuan },
        kendaraan: { kode_truk: trip.kode_truk, nomor_polisi: trip.nomor_polisi },
        posisi_kendaraan: gpsRes.rows[0] || null,
        status_rfid: rfidRes.rows[0]
          ? { terdeteksi: rfidRes.rows[0].is_detected, waktu: rfidRes.rows[0].timestamp }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { trackPackage };
