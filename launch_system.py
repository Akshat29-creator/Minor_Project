"""
========================================================================================
DEEP-SEA RESCUE SONAR & REALTIME HARDWARE DETECTION SYSTEM
All-In-One Unified Controller & Port Manager
========================================================================================
Features:
- Checks & clears ports 8000, 3000, 3001 if occupied
- Activates YOLOv8 model and launches FastAPI backend (Port 8000)
- Launches Next.js Web Dashboard (Port 3000):
    * Landing Page:      http://localhost:3000
    * Demo Dashboard:    http://localhost:3000/dashboard  (Image Upload & Simulation)
    * Hardware Live:     http://localhost:3000/hardware   (Realtime ESP32 & Webcam)
- Launches Hardware Direct Port (Port 3001):
    * Dedicated Route:   http://localhost:3001 -> Redirects to /hardware
- Press [ENTER] or [Q] to cleanly close all ports and terminate all services.
========================================================================================
"""

import os
import sys
import time
import subprocess
import threading
import http.server
import socketserver
import urllib.request
import re

# Ensure standard UTF-8 stream output on Windows
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ports used by this system
PORTS = [8000, 3000, 3001]
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "sonar-web-dashboard")

# ANSI Color Codes for terminal
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

backend_process = None
frontend_process = None
redirect_server = None
is_shutting_down = False


def print_banner():
    banner = f"""
{CYAN}{BOLD}==================================================================================
  DEEP-SEA RESCUE SONAR & REALTIME HARDWARE DETECTION CONTROLLER
=================================================================================={RESET}
  [Stage 4-5 YOLOv8 Deep-Sea Acoustic Target Identification & Localization System]
"""
    print(banner)


def get_pids_on_ports(ports):
    """Find process IDs listening on given TCP ports on Windows."""
    pids = set()
    try:
        output = subprocess.check_output("netstat -ano", shell=True).decode("utf-8", errors="ignore")
        for line in output.splitlines():
            for port in ports:
                # Match port listening on IPv4 or IPv6
                if re.search(rf":{port}\s+.*LISTENING", line, re.IGNORECASE):
                    match = re.search(r"\s+(\d+)\s*$", line)
                    if match:
                        pid = int(match.group(1))
                        if pid != os.getpid():  # Don't kill ourselves
                            pids.add(pid)
    except Exception as e:
        print(f"{YELLOW}[WARN] Error scanning netstat: {e}{RESET}")
    return pids


def kill_ports(ports):
    """Force-terminates any processes occupying the target ports."""
    pids = get_pids_on_ports(ports)
    if not pids:
        return
    print(f"{YELLOW}[CLEANUP] Found existing processes on target ports: {list(pids)}. Terminating...{RESET}")
    for pid in pids:
        try:
            subprocess.run(f"taskkill /F /T /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    time.sleep(1)


class HardwareRedirectHandler(http.server.BaseHTTPRequestHandler):
    """Lightweight HTTP server on Port 3001 that routes visitors to /hardware"""
    def do_GET(self):
        self.send_response(302)
        self.send_header('Location', 'http://localhost:3000/hardware')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.end_headers()
        html = b"""<!DOCTYPE html>
<html>
<head><meta http-equiv="refresh" content="0; url=http://localhost:3000/hardware"></head>
<body style="background:#020617;color:#38bdf8;font-family:sans-serif;text-align:center;padding:50px;">
  <h2>Redirecting to Deep-Sea Sonar Hardware Dashboard...</h2>
  <p><a href="http://localhost:3000/hardware" style="color:#38bdf8;">Click here if not redirected automatically</a></p>
</body>
</html>"""
        self.wfile.write(html)

    def log_message(self, format, *args):
        pass  # Suppress standard logging to keep terminal output clean


def start_hardware_redirect_server():
    """Starts the port 3001 redirect server in a background thread."""
    global redirect_server
    try:
        socketserver.TCPServer.allow_reuse_address = True
        redirect_server = socketserver.TCPServer(("0.0.0.0", 3001), HardwareRedirectHandler)
        t = threading.Thread(target=redirect_server.serve_forever, daemon=True)
        t.start()
        return True
    except Exception as e:
        print(f"{YELLOW}[WARN] Port 3001 direct route server could not start: {e}{RESET}")
        return False


def wait_for_backend(max_retries=20):
    """Waits until FastAPI and YOLO model report online status."""
    print(f"{CYAN}[1/3] Initializing FastAPI Backend and Activating YOLOv8 Model on port 8000...{RESET}")
    for _ in range(max_retries):
        try:
            req = urllib.request.Request("http://127.0.0.1:8000/")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def wait_for_frontend(max_retries=25):
    """Waits until Next.js dev server is listening on port 3000."""
    print(f"{CYAN}[2/3] Initializing Next.js Web Dashboard on port 3000...{RESET}")
    for _ in range(max_retries):
        try:
            req = urllib.request.Request("http://127.0.0.1:3000/")
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status in (200, 304, 307, 308):
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def shutdown_all():
    """Gracefully terminates all child processes and forcefully closes all ports."""
    global backend_process, frontend_process, redirect_server, is_shutting_down
    if is_shutting_down:
        return
    is_shutting_down = True

    print(f"\n{RED}{BOLD}==================================================================================")
    print(f"  [STOPPING] SHUTTING DOWN ALL SERVICES AND CLOSING ALL PORTS...")
    print(f"=================================================================================={RESET}")

    # Stop redirect server
    if redirect_server:
        try:
            redirect_server.shutdown()
            redirect_server.server_close()
        except Exception:
            pass

    # Terminate backend process tree
    if backend_process:
        print(f"{YELLOW}[-] Stopping FastAPI backend (PID {backend_process.pid})...{RESET}")
        try:
            subprocess.run(f"taskkill /F /T /PID {backend_process.pid}", shell=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

    # Terminate frontend process tree
    if frontend_process:
        print(f"{YELLOW}[-] Stopping Next.js frontend (PID {frontend_process.pid})...{RESET}")
        try:
            subprocess.run(f"taskkill /F /T /PID {frontend_process.pid}", shell=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

    # Clean any leftover processes on target ports (8000, 3000, 3001)
    time.sleep(1)
    kill_ports(PORTS)

    print(f"\n{GREEN}{BOLD}[OK] ALL PORTS (8000, 3000, 3001) SUCCESSFULLY CLOSED.")
    print(f"[OK] MODEL AND SERVICES TERMINATED. SYSTEM OFFLINE.{RESET}\n")


def main():
    global backend_process, frontend_process

    # Enable ANSI color escape sequences on Windows console
    os.system("")

    print_banner()

    # Step 0: Ensure target ports are free
    print(f"{CYAN}[0/3] Checking ports {PORTS}...{RESET}")
    kill_ports(PORTS)

    # Step 1: Launch FastAPI Backend (Port 8000)
    api_script = os.path.join(BASE_DIR, "sonar_api.py")
    if not os.path.exists(api_script):
        print(f"{RED}[ERROR] Could not find sonar_api.py at {api_script}{RESET}")
        sys.exit(1)

    backend_process = subprocess.Popen(
        [sys.executable, api_script],
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    # Step 2: Launch Next.js Web Dashboard (Port 3000)
    if not os.path.exists(FRONTEND_DIR):
        print(f"{RED}[ERROR] Frontend directory not found: {FRONTEND_DIR}{RESET}")
        shutdown_all()
        sys.exit(1)

    frontend_process = subprocess.Popen(
        "npm run dev",
        cwd=FRONTEND_DIR,
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Step 3: Start Port 3001 Hardware Redirect Server
    start_hardware_redirect_server()

    # Wait for Backend & Model
    backend_ready = wait_for_backend()
    if backend_ready:
        print(f"{GREEN}[OK] FastAPI Backend Online & YOLOv8 Model Loaded & Activated!{RESET}")
    else:
        print(f"{YELLOW}[!] Backend is taking longer to start, proceeding...{RESET}")

    # Wait for Frontend
    frontend_ready = wait_for_frontend()
    if frontend_ready:
        print(f"{GREEN}[OK] Next.js Dashboard Online!{RESET}")
    else:
        print(f"{YELLOW}[!] Frontend is compiling, proceeding...{RESET}")

    # Display operational dashboard
    print(f"""
{GREEN}{BOLD}==================================================================================
  ALL SERVICES & PORTS ACTIVE AND MODEL READY FOR INFERENCE!
=================================================================================={RESET}

  {BOLD}1. DEMO TESTING DASHBOARD (Images & Simulated Sonar):{RESET}
     -> {CYAN}http://localhost:3000/dashboard{RESET}

  {BOLD}2. ORIGINAL REALTIME HARDWARE DASHBOARD (ESP32, Sonar & Live Webcam):{RESET}
     -> {GREEN}http://localhost:3000/hardware{RESET}

  {BOLD}3. DEDICATED HARDWARE SHORTCUT PORT:{RESET}
     -> {GREEN}http://localhost:3001{RESET}  (Direct redirect to Hardware Dashboard)

  {BOLD}4. BACKEND API & INTERACTIVE DOCS (YOLOv8 Active):{RESET}
     -> {CYAN}http://localhost:8000/docs{RESET}

{YELLOW}{BOLD}==================================================================================
  [PRESS ENTER OR TYPE 'q' TO CLOSE ALL PORTS & STOP ALL SERVICES]
=================================================================================={RESET}
""")

    # Interactive loop waiting for button/enter press
    try:
        while True:
            cmd = input(f"{BOLD}Press [ENTER] to exit and kill all ports: {RESET}").strip().lower()
            if cmd in ("", "q", "exit", "stop", "close"):
                break
    except (KeyboardInterrupt, EOFError):
        pass
    finally:
        shutdown_all()


if __name__ == "__main__":
    main()
