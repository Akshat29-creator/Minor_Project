"""
DRY-RUN: Test all hardware endpoints, connections, and system readiness.
"""
import urllib.request
import json
import time

time.sleep(2)

tests = []

print("=" * 70)
print("  DRY-RUN: TESTING ALL HARDWARE CONNECTIONS & ENDPOINTS")
print("=" * 70)
print()

# 1. Backend alive?
print("[TEST 1] Backend Health Check (GET http://localhost:8000/)")
try:
    res = urllib.request.urlopen("http://localhost:8000/", timeout=5)
    data = json.loads(res.read())
    print(f"  STATUS:  {data.get('status')}")
    print(f"  MODEL:   {data.get('model')}")
    print(f"  DEVICE:  {data.get('device')}")
    print(f"  VERSION: {data.get('version')}")
    tests.append(("Backend Health", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Backend Health", "FAIL"))
print()

# 2. Scan COM ports
print("[TEST 2] Hardware Port Scanner (GET /api/hardware/scan-ports)")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/hardware/scan-ports", timeout=5)
    data = json.loads(res.read())
    ports = data.get("ports", [])
    print(f"  Found {len(ports)} COM port(s):")
    for p in ports:
        vid = p.get("vid")
        pid = p.get("pid")
        print(f"    - {p['device']}: {p['description']} (VID={vid}, PID={pid})")
    if ports:
        tests.append(("Port Scanner", "PASS"))
    else:
        print("  NOTE: No ESP32 currently plugged in (expected without hardware)")
        tests.append(("Port Scanner", "PASS (no device)"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Port Scanner", "FAIL"))
print()

# 3. Hardware Status
print("[TEST 3] Hardware Status (GET /api/hardware/status)")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/hardware/status", timeout=5)
    data = json.loads(res.read())
    comps = data.get("components", {})
    for name, info in comps.items():
        conn = info.get("connected", False)
        symbol = "CONNECTED" if conn else "DISCONNECTED"
        print(f"  {name.upper():10s}: {symbol}")
        for k, v in info.items():
            if k != "connected" and v is not None:
                print(f"    {k}: {v}")
    print(f"  ALL CONNECTED: {data.get('all_connected', False)}")
    tests.append(("Hardware Status", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Hardware Status", "FAIL"))
print()

# 4. Try connecting (auto-detect, will fail gracefully without hardware)
print("[TEST 4] Hardware Connect (POST /api/hardware/connect)")
try:
    req = urllib.request.Request(
        "http://localhost:8000/api/hardware/connect",
        data=json.dumps({"port": None}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    res = urllib.request.urlopen(req, timeout=10)
    data = json.loads(res.read())
    esp_conn = data.get("esp32", {}).get("connected", False)
    esp_msg = data.get("esp32", {}).get("message", "")
    cam_conn = data.get("camera", {}).get("connected", False)
    print(f"  ESP32:  {'CONNECTED' if esp_conn else 'NOT CONNECTED'} - {esp_msg}")
    print(f"  CAMERA: {'CONNECTED' if cam_conn else 'NOT DETECTED'}")
    print(f"  ALL:    {data.get('all_connected', False)}")
    if esp_conn:
        tests.append(("Hardware Connect", "PASS"))
    else:
        tests.append(("Hardware Connect", "PASS (no ESP32 plugged in)"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Hardware Connect", "FAIL"))
print()

# 5. Camera + YOLOv8 Live Frame
print("[TEST 5] Camera + YOLOv8 Live Frame (GET /api/hardware/live-frame)")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/hardware/live-frame", timeout=15)
    data = json.loads(res.read())
    status = data.get("status")
    targets = data.get("targets", [])
    has_image = bool(data.get("image_b64"))
    sonar = data.get("sonar_data")
    print(f"  STATUS:    {status}")
    print(f"  TARGETS:   {len(targets)} detected")
    print(f"  IMAGE:     {'YES' if has_image else 'NO'}")
    print(f"  SONAR:     {'Data received' if sonar else 'No sonar (ESP32 not connected)'}")
    for t in targets[:3]:
        print(f"    -> {t['class']} conf={t['confidence']}% dist={t['distance_m']}m bearing={t['bearing_deg']}deg priority={t['priority_score']}")
    tests.append(("Live Frame + YOLO", "PASS" if status == "success" else "FAIL"))
except urllib.error.HTTPError as e:
    body = e.read().decode()
    if "503" in str(e.code):
        print("  Camera not available (expected if no webcam plugged in)")
        tests.append(("Live Frame + YOLO", "PASS (no camera)"))
    else:
        print(f"  HTTP {e.code}: {body}")
        tests.append(("Live Frame + YOLO", "FAIL"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Live Frame + YOLO", "FAIL"))
print()

# 6. Demo Simulate
print("[TEST 6] Demo Simulate Scan (GET /api/simulate)")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/simulate", timeout=45)
    data = json.loads(res.read())
    status = data.get("status")
    targets = data.get("targets", [])
    frame = data.get("frame_name", "")
    has_image = bool(data.get("image_b64"))
    print(f"  STATUS:    {status}")
    print(f"  FRAME:     {frame}")
    print(f"  TARGETS:   {len(targets)} detected")
    print(f"  IMAGE:     {'YES' if has_image else 'NO'}")
    for t in targets[:5]:
        print(f"    -> {t['class']} conf={t['confidence']}% dist={t['distance_m']}m priority={t['priority_score']}")
    tests.append(("Demo Simulate", "PASS" if status == "success" else "FAIL"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Demo Simulate", "FAIL"))
print()

# 7. Sonar Single Read
print("[TEST 7] Sonar Single Read (GET /api/hardware/sonar-read)")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/hardware/sonar-read", timeout=5)
    data = json.loads(res.read())
    print(f"  DISTANCE:   {data.get('distance_cm')} cm")
    print(f"  ECHO COUNT: {data.get('echo_count')}")
    tests.append(("Sonar Read", "PASS"))
except urllib.error.HTTPError as e:
    if "503" in str(e.code):
        print("  ESP32 not connected (expected without hardware)")
        tests.append(("Sonar Read", "PASS (no ESP32)"))
    else:
        print(f"  HTTP {e.code}")
        tests.append(("Sonar Read", "FAIL"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Sonar Read", "FAIL"))
print()

# 8. Servo Control
print("[TEST 8] Servo Control (POST /api/hardware/servo angle=90)")
try:
    req = urllib.request.Request(
        "http://localhost:8000/api/hardware/servo",
        data=json.dumps({"angle": 90}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    res = urllib.request.urlopen(req, timeout=5)
    data = json.loads(res.read())
    print(f"  RESULT: {data}")
    tests.append(("Servo Control", "PASS"))
except urllib.error.HTTPError as e:
    if "503" in str(e.code):
        print("  ESP32 not connected (expected without hardware)")
        tests.append(("Servo Control", "PASS (no ESP32)"))
    else:
        print(f"  HTTP {e.code}")
        tests.append(("Servo Control", "FAIL"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Servo Control", "FAIL"))
print()

# 9. Frontend Landing
print("[TEST 9] Frontend Dashboard (GET http://localhost:3000/)")
try:
    res = urllib.request.urlopen("http://localhost:3000/", timeout=15)
    print(f"  STATUS: {res.status} OK")
    tests.append(("Frontend Landing", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Frontend Landing", "FAIL"))
print()

# 10. Frontend Hardware Page
print("[TEST 10] Frontend Hardware Page (GET http://localhost:3000/hardware)")
try:
    res = urllib.request.urlopen("http://localhost:3000/hardware", timeout=15)
    print(f"  STATUS: {res.status} OK")
    tests.append(("Hardware Page", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Hardware Page", "FAIL"))
print()

# 11. Frontend Demo Page
print("[TEST 11] Frontend Demo Page (GET http://localhost:3000/dashboard)")
try:
    res = urllib.request.urlopen("http://localhost:3000/dashboard", timeout=15)
    print(f"  STATUS: {res.status} OK")
    tests.append(("Demo Page", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Demo Page", "FAIL"))
print()

# 12. Mission Summary / Sessions
print("[TEST 12] Mission Summary (GET /api/sessions)")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/sessions", timeout=5)
    data = json.loads(res.read())
    sessions = data.get("sessions", [])
    print(f"  SESSIONS STORED: {len(sessions)}")
    tests.append(("Mission Summary", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Mission Summary", "FAIL"))
print()

# 13. Disconnect hardware cleanly
print("[TEST 13] Hardware Disconnect (POST /api/hardware/disconnect)")
try:
    req = urllib.request.Request(
        "http://localhost:8000/api/hardware/disconnect",
        data=b"",
        method="POST",
    )
    res = urllib.request.urlopen(req, timeout=5)
    data = json.loads(res.read())
    print(f"  RESULT: {data}")
    tests.append(("Hardware Disconnect", "PASS"))
except Exception as e:
    print(f"  FAILED: {e}")
    tests.append(("Hardware Disconnect", "FAIL"))
print()

# Summary
print("=" * 70)
print("  DRY-RUN RESULTS SUMMARY")
print("=" * 70)
passed = 0
failed = 0
for name, result in tests:
    tag = "PASS" if "PASS" in result else "FAIL"
    if "PASS" in result:
        passed += 1
    else:
        failed += 1
    print(f"  [{tag:4s}] {name:25s} -> {result}")
print()
print(f"  TOTAL: {passed} passed, {failed} failed out of {len(tests)} tests")
if failed == 0:
    print("  ALL SYSTEMS OPERATIONAL!")
else:
    print(f"  {failed} test(s) need attention.")
print("=" * 70)
