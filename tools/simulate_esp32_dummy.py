#!/usr/bin/env python3
"""
tools/simulate_esp32_dummy.py
Dummy pengganti hardware ESP32 + SIM7600 + RFID scanner.
Meniru PERSIS perilaku firmware VTS_MQTT.ino:
  - Topic   : vts/telemetry/TRUCK-001
  - Payload : {"timestamp", "id", "gps":{lat,lon,speed}, "detected_packages":[EPC...]}
  - Rute    : 18 waypoint JNE Bojongsoang -> JNE Cibabat (sama dengan firmware)
  - Interval: 10 detik per siklus (sama dengan SEND_INTERVAL firmware)
  - EPC     : 20 tag sama dengan seeds/seed_esp32_test.js
  - Broker  : HiveMQ Cloud, TLS port 8883 (sama dengan backend .env)

Persiapan (sekali saja):
  pip install paho-mqtt
  node seeds/seed_esp32_test.js        # buat TRUCK-001 + trip 'berjalan'
  npm run dev                          # jalankan backend

Cara pakai:
  # Kirim semua 20 paket, 1 siklus per waypoint (18 siklus, ~3 menit):
  python tools/simulate_esp32_dummy.py

  # Lebih cepat (interval 2 detik):
  python tools/simulate_esp32_dummy.py --interval 2

  # Simulasikan paket hilang mulai 50% perjalanan (memicu alert PAKET_HILANG):
  python tools/simulate_esp32_dummy.py --interval 2 --lost PKT-03 PKT-07 --lost-at 0.5

  # Kirim satu pesan saja lalu berhenti (tes koneksi cepat):
  python tools/simulate_esp32_dummy.py --once
"""

import argparse
import json
import ssl
import sys
import time
from datetime import datetime, timedelta, timezone

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("Jalankan dulu: pip install paho-mqtt")
    sys.exit(1)

# ── Konfigurasi — HARUS sama dengan firmware & backend .env ──────────────────
BROKER    = "38aa5a099009439f81c7fb60c4865b78.s1.eu.hivemq.cloud"
PORT      = 8883
MQTT_USER = "vts-backend"
MQTT_PASS = "vtsH1vemq123"
TRUCK_ID     = "TRUCK-001"
TOPIC        = f"vts/telemetry/{TRUCK_ID}"
TOPIC_STATUS = f"vts/status/{TRUCK_ID}"  # kondisi alat (retained + LWT), sama seperti firmware

# 18 waypoint + kecepatan — disalin persis dari VTS_MQTT.ino
WAYPOINTS = [
    (-6.97840, 107.63880, 10.0), (-6.97230, 107.63520, 20.0),
    (-6.96510, 107.63010, 35.0), (-6.95720, 107.62480, 45.0),
    (-6.94900, 107.61820, 52.0), (-6.94210, 107.61050, 58.0),
    (-6.93600, 107.60280, 62.0), (-6.93250, 107.59520, 60.0),
    (-6.93180, 107.58640, 57.0), (-6.93280, 107.57800, 53.0),
    (-6.93450, 107.57020, 48.0), (-6.93120, 107.56410, 42.0),
    (-6.92350, 107.55980, 36.0), (-6.91560, 107.55620, 30.0),
    (-6.90780, 107.55310, 24.0), (-6.90040, 107.54890, 18.0),
    (-6.89380, 107.54520, 12.0), (-6.88790, 107.53940,  8.0),
]

# 20 EPC — sama persis dengan seeds/seed_esp32_test.js (kode: PKT-01 .. PKT-20)
PACKAGES = {
    "PKT-01": "E28069150000700F0CA6BA45", "PKT-02": "E28069150000600F0CA6D245",
    "PKT-03": "E28069150000600F0CA6C645", "PKT-04": "E28069150000600F0CA6E245",
    "PKT-05": "E28069150000700F0CA6C245", "PKT-06": "E28069150000600F0CA6DE45",
    "PKT-07": "E28069150000700F0CA6EA45", "PKT-08": "E28069150000700F0CA6D645",
    "PKT-09": "E28069150000700F0CA6CE45", "PKT-10": "E28069150000600F0CA6BE45",
    "PKT-11": "E28069150000600F0CA6CA45", "PKT-12": "E28069150000700F0CA6DA45",
    "PKT-13": "E28069150000600F0CA6EE45", "PKT-14": "E28069150000700F0CA6E645",
    "PKT-15": "E28069150000600F0CA6F645", "PKT-16": "E28069150000700F0CA6F245",
    "PKT-17": "E28069150000600F0CA6FA45", "PKT-18": "E28069150000700F0CA6FE45",
    "PKT-19": "E28069150000700F0CA70645", "PKT-20": "E28069150000600F0CA70245",
}

WIB = timezone(timedelta(hours=7))


def make_timestamp():
    """Format sama dengan firmware: 2026-07-10T14:30:00+07:00 (WIB)."""
    return datetime.now(WIB).strftime("%Y-%m-%dT%H:%M:%S+07:00")


_start = time.time()

def publish_status(client, online=True, gps_fix=True, csq=24):
    """Kirim kondisi alat — payload identik dengan publishStatus() di firmware."""
    status = {
        "id": TRUCK_ID,
        "online": online,
        "gps_fix": gps_fix,
        "signal_csq": csq,
        "uptime_s": int(time.time() - _start),
    }
    client.publish(TOPIC_STATUS, json.dumps(status), qos=1, retain=True)


def connect_mqtt():
    print(f"[MQTT] Menghubungi {BROKER}:{PORT} (TLS)... ", end="", flush=True)
    state = {"rc": None}

    def on_connect(client, userdata, flags, rc, properties=None):
        state["rc"] = rc if isinstance(rc, int) else rc.value

    # paho-mqtt v2 mengubah API konstruktor; dukung keduanya
    try:
        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"vts-dummy-{int(time.time())}",
        )
    except AttributeError:
        client = mqtt.Client(client_id=f"vts-dummy-{int(time.time())}")

    client.on_connect = on_connect
    client.username_pw_set(MQTT_USER, MQTT_PASS)
    client.tls_set_context(ssl.create_default_context())  # TLS wajib di port 8883

    # LWT: jika dummy dimatikan paksa (bukan Ctrl+C), broker umumkan offline
    client.will_set(TOPIC_STATUS, json.dumps({"id": TRUCK_ID, "online": False}),
                    qos=1, retain=True)

    try:
        client.connect(BROKER, PORT, keepalive=60)
    except Exception as e:
        print(f"\nGAGAL koneksi: {e}")
        print("  - Pastikan internet aktif dan port 8883 tidak diblokir firewall/jaringan kampus.")
        sys.exit(1)

    client.loop_start()
    deadline = time.time() + 10
    while state["rc"] is None and time.time() < deadline:
        time.sleep(0.1)

    if state["rc"] != 0:
        print(f"\nGAGAL: broker menolak koneksi (rc={state['rc']}).")
        print("  rc=4/5 biasanya berarti username/password salah di HiveMQ Cloud.")
        sys.exit(1)

    print("TERHUBUNG")
    return client


def main():
    p = argparse.ArgumentParser(description="Dummy ESP32 VTS Logistik (tanpa hardware)")
    p.add_argument("--interval", type=float, default=10.0,
                   help="Detik antar siklus (default 10, sama dengan firmware)")
    p.add_argument("--lost", nargs="*", default=[], metavar="PKT-XX",
                   help="Kode paket yang 'hilang' di tengah jalan, mis: --lost PKT-03 PKT-07")
    p.add_argument("--lost-at", type=float, default=0.5, dest="lost_at",
                   help="Fraksi perjalanan saat paket mulai hilang (0.0-1.0, default 0.5)")
    p.add_argument("--once", action="store_true",
                   help="Kirim 1 pesan di waypoint pertama lalu berhenti (tes koneksi)")
    args = p.parse_args()

    bad = [k for k in args.lost if k not in PACKAGES]
    if bad:
        p.error(f"Kode paket tidak dikenal: {bad}. Gunakan PKT-01 s.d. PKT-20.")

    client = connect_mqtt()
    total = 1 if args.once else len(WAYPOINTS)

    print(f"[SIM]  Topic    : {TOPIC}")
    print(f"[SIM]  Paket    : {len(PACKAGES)} tag" +
          (f" | hilang: {', '.join(args.lost)} mulai {args.lost_at*100:.0f}%" if args.lost else ""))
    print(f"[SIM]  Siklus   : {total} x tiap {args.interval:g}s\n")

    try:
        for i in range(total):
            lat, lon, speed = WAYPOINTS[i]
            progress = i / max(len(WAYPOINTS) - 1, 1)

            # Status alat tiap siklus (CSQ divariasikan sedikit agar terlihat hidup)
            publish_status(client, online=True, gps_fix=True,
                           csq=max(10, min(31, 22 + (i % 5) - 2)))

            detected = [epc for kode, epc in PACKAGES.items()
                        if not (kode in args.lost and progress >= args.lost_at)]

            payload = {
                "timestamp": make_timestamp(),
                "id": TRUCK_ID,
                "gps": {"lat": round(lat, 5), "lon": round(lon, 5), "speed": speed},
                "detected_packages": detected,
                "sent_ms": int(time.time() * 1000),  # untuk uji latensi NFR-02 (opsional)
            }

            info = client.publish(TOPIC, json.dumps(payload), qos=1)
            info.wait_for_publish(timeout=10)

            hilang = len(PACKAGES) - len(detected)
            status = f"{hilang} paket HILANG" if hilang else "semua paket terbaca"
            print(f"  [{i+1:2}/{total}] GPS ({lat:.5f}, {lon:.5f}) @ {speed:4.1f} km/h | "
                  f"{len(detected)}/{len(PACKAGES)} tag | {status}")

            if i < total - 1:
                time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\n[SIM] Dihentikan oleh pengguna.")
    else:
        print(f"\n[SIM] Selesai — {total} pesan terkirim ke {BROKER}.")
        print("      Cek log backend: harus muncul '[MQTT] TRUCK-001 | Ck=...%'")

    # Pamit dengan rapi: umumkan offline (di alat asli, ini tugas LWT broker)
    publish_status(client, online=False)
    time.sleep(0.5)
    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
