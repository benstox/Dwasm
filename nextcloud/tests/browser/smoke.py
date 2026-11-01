#!/usr/bin/env python3
"""Boot smoke test (R1/R2/R3): the page must reach the game loop with no
uncaught errors, a rejected file must be refused with a message, and IDBFS
must be writable. Usage: python3 nextcloud/tests/browser/smoke.py"""
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

HERE = Path(__file__).resolve().parent
PORT = 8765
BASE = f"http://localhost:{PORT}/"


def wait_for_server() -> None:
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE, timeout=1)
            return
        except Exception:
            time.sleep(0.2)
    raise SystemExit("server never came up")


def check(condition, message) -> None:
    print(("ok   " if condition else "FAIL ") + message)
    if not condition:
        raise SystemExit(1)


def main() -> None:
    server = subprocess.Popen([sys.executable, str(HERE / "serve.py"), str(PORT)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_for_server()
        options = Options()
        options.add_argument("-headless")
        driver = webdriver.Firefox(options=options)
        driver.set_window_size(1280, 900)

        # 1. The launcher renders with the bundled games available.
        driver.get(BASE)
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "dwasm-game")))
        games = driver.find_elements(By.CSS_SELECTOR, "#dwasm-game option")
        check(len(games) == 2, f"two bundled games offered ({[g.text for g in games]})")
        check(driver.find_element(By.ID, "dwasm-start").is_enabled(), "Play button enabled")

        # 2. An invalid file is rejected before anything reaches MemFS.
        bad = HERE / "fixtures" / "broken.wad"
        bad.parent.mkdir(exist_ok=True)
        bad.write_bytes(b"this is not a wad")
        driver.find_element(By.ID, "dwasm-files").send_keys(str(bad))
        WebDriverWait(driver, 10).until(
            lambda d: not d.find_element(By.ID, "dwasm-start").is_enabled())
        message = driver.find_element(By.ID, "dwasm-picked").text
        check("broken.wad" in message and "not a WAD" in message,
              f"invalid WAD refused by name: {message!r}")

        # 3. Boot: Freedoom is fetched, expanded and the engine starts.
        driver.get(BASE)
        WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.ID, "dwasm-game")))
        driver.find_element(By.ID, "dwasm-start").click()
        WebDriverWait(driver, 120).until(
            lambda d: d.find_element(By.ID, "canvas").value_of_css_property("display") == "block")
        check(True, "engine reached the game loop (canvas shown)")

        # 4. IDBFS is mounted and writable (R4's mechanism).
        sync = driver.execute_async_script("""
            var done = arguments[arguments.length - 1];
            FS.syncfs(false, function (err) {
                if (err) return done('sync error: ' + err);
                if (!indexedDB.databases) return done('ok (no databases() API)');
                indexedDB.databases().then(function (dbs) {
                    done(dbs.length > 0 ? 'ok: ' + dbs.map(d => d.name).join(', ') : 'no databases');
                });
            });
        """)
        check(str(sync).startswith('ok'), f"IDBFS sync to IndexedDB: {sync}")

        errors = driver.execute_script("return window.__errors")
        failed = driver.execute_script("return window.__failed")
        check(not errors, f"no uncaught errors: {errors}")
        check(not failed, f"no failed requests: {failed}")

        driver.save_screenshot("/tmp/dwasm-smoke.png")
        print("screenshot: /tmp/dwasm-smoke.png")
    finally:
        server.terminate()


if __name__ == "__main__":
    main()