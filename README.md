# VTS Logistik — Backend

Backend Node.js + Express untuk sistem pelacakan paket real-time pada kendaraan logistik.

## Cara Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Setup environment
```bash
cp .env.example .env
# Edit .env sesuai konfigurasi lokal kamu
```

### 3. Buat database PostgreSQL
```bash
# Di psql atau pgAdmin:
CREATE DATABASE vts_logistik;
```

### 4. Jalankan migrasi
```bash
npm run migrate
# Akan membuat semua tabel: user, truck, driver, manifest,
# package, manifest_package, trip, telemetry, gps_log, rfid_event, alert
```

### 5. Jalankan server
```bash
npm run dev    # development (nodemon)
npm start      # production
```

## Kebutuhan eksternal
- **PostgreSQL** v14+ (jalankan lokal atau Docker)
- **MQTT Broker** — bisa pakai [Mosquitto](https://mosquitto.org/) lokal:
  ```bash
  # Docker
  docker run -it -p 1883:1883 eclipse-mosquitto
  ```

## API Endpoints

| Method | Path | Auth | Deskripsi |
|--------|------|------|-----------|
| POST | `/api/auth/login` | - | Login admin/driver |
| POST | `/api/auth/register` | admin | Buat akun baru |
| GET | `/api/auth/me` | any | Info user login |
| GET | `/api/manifests` | admin | List manifest |
| POST | `/api/manifests` | admin | Buat manifest + import paket |
| GET | `/api/manifests/:id` | any | Detail manifest + paket |
| GET | `/api/trips` | any | List trip |
| POST | `/api/trips` | admin | Buat trip baru |
| PATCH | `/api/trips/:id/start` | admin | Mulai perjalanan |
| PATCH | `/api/trips/:id/finish` | admin | Selesaikan perjalanan |
| GET | `/api/trips/:id/history` | any | Riwayat GPS + alert trip |
| GET | `/api/armada` | admin | Semua armada aktif + posisi |
| GET | `/api/armada/:trip_id/detail` | admin | Detail muatan satu truk |
| GET | `/api/tracking/:kode_paket` | **publik** | Tracking resi pelanggan |

## WebSocket Events

**Client → Server:**
| Event | Payload | Deskripsi |
|-------|---------|-----------|
| `join_trip` | `{ trip_id }` | Monitor trip tertentu |
| `track_package` | `{ kode_paket }` | Tracking paket pelanggan |

**Server → Client:**
| Event | Deskripsi |
|-------|-----------|
| `telemetry_update` | Update posisi + completeness setiap siklus RFID |
| `paket_hilang` | Alert ketika paket tidak terdeteksi N siklus berturut-turut |

## Payload MQTT dari ESP32
```json
{
  "timestamp": "2026-05-20T10:30:00Z",
  "id": "TRUCK-001",
  "gps": { "lat": -6.9175, "lon": 107.6191 },
  "detected_packages": ["TAG-001", "TAG-002", "TAG-099"]
}
```
Topic: `vts/telemetry/TRUCK-001`

## Struktur Folder
```
src/
├── app.js                  # Entry point
├── config/
│   └── database.js         # Koneksi PostgreSQL + helpers
├── controllers/
│   ├── authController.js
│   ├── manifestController.js
│   ├── tripController.js
│   ├── armadaController.js
│   └── trackingController.js
├── middleware/
│   ├── auth.js             # JWT authenticate + authorize
│   └── errorHandler.js     # Validasi & global error
├── mqtt/
│   └── mqttHandler.js      # Subscribe ESP32, proses telemetry, deteksi anomali
├── routes/
│   ├── auth.js
│   ├── manifest.js
│   ├── trip.js
│   ├── armada.js
│   └── tracking.js
└── socket/
    └── socketHandler.js    # WebSocket rooms & events
migrations/
└── run.js                  # Buat semua tabel PostgreSQL
```
