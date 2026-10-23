"""Starts YanaBus.  Run:  python run.py"""
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "backend"))

import uvicorn

import config


def lan_address():
    """The laptop's address on the Wi-Fi, so phones can open the pages."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))      # nothing is actually sent
            return s.getsockname()[0]
    except OSError:
        return "localhost"


if __name__ == "__main__":
    ip = lan_address()
    print("\n  YanaBus is starting")
    print(f"  Laptop (with demo controls): http://localhost:{config.PORT}/?demo")
    print(f"  Phone, passenger view      : http://{ip}:{config.PORT}/")
    print(f"  Phone, conductor view      : http://{ip}:{config.PORT}/conductor")
    print(f"  Authority dashboard        : http://{ip}:{config.PORT}/dashboard\n", flush=True)
    uvicorn.run("app:app", host=config.HOST, port=config.PORT, app_dir=str(ROOT / "backend"))
