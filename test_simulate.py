import urllib.request, json
print("Testing Demo Simulate with 60s timeout...")
try:
    res = urllib.request.urlopen("http://localhost:8000/api/simulate", timeout=60)
    data = json.loads(res.read())
    status = data.get("status")
    frame = data.get("frame_name", "")
    targets = data.get("targets", [])
    has_img = bool(data.get("image_b64"))
    print("STATUS:", status)
    print("FRAME:", frame)
    print("TARGETS:", len(targets), "detected")
    print("IMAGE:", "YES" if has_img else "NO")
    for t in targets[:5]:
        cls = t["class"]
        conf = t["confidence"]
        dist = t["distance_m"]
        prio = t["priority_score"]
        print("  ->", cls, "conf=" + str(conf) + "%", "dist=" + str(dist) + "m", "priority=" + str(prio))
    print("RESULT: PASS")
except Exception as e:
    print("FAILED:", e)
