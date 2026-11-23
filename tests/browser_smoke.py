"""Exercise the built starter at a project subpath in Chromium."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "example-tool")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/example-tool/")
                page.locator("#example").click()
                page.locator("#results").wait_for(state="visible")
                assert "Leo Triplet" in page.locator("#receipt-name").inner_text()
                assert "1.397" in page.locator("#metrics").inner_text()
                page.locator("#job").fill("777")
                page.locator("#inspect-form button").click()
                page.locator("#job-help").wait_for(state="visible")
                assert "777" in page.locator("#requested-job").inner_text()
                import json
                receipt = json.loads((ROOT / "web/data/example.json").read_text())
                receipt["name"] = '<img src=x onerror="alert(1)">'
                receipt["jobId"] = "888"
                receipt["calibration"]["ra"] += 1
                page.locator("#import").set_input_files({"name":"receipt.json","mimeType":"application/json","buffer":json.dumps(receipt).encode()})
                page.wait_for_function("document.querySelector('#selected').options.length === 2")
                assert page.locator("#receipt-name").inner_text() == receipt["name"]
                assert page.locator("img").count() == 0
                page.locator("#compare").select_option("0")
                assert "CENTRE SEPARATION" in page.locator("#comparison").inner_text()
                with page.expect_download() as download:
                    page.locator("#save").click()
                assert download.value.suggested_filename.endswith(".json")
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                # Same-origin owner portal: fake API responses, never submit a photo to a provider.
                owner_html = subprocess.check_output(["node", "--input-type=module", "-e", "import {OWNER_PAGE} from './adapter/owner-page.mjs';process.stdout.write(OWNER_PAGE.replaceAll('{{NONCE}}','test-nonce'));"], cwd=ROOT, text=True)
                owner = browser.new_page(viewport={"width": 390, "height": 844})
                owner.on("pageerror", lambda error: errors.append(str(error)))
                genuine = json.loads((ROOT / "web/data/example.json").read_text())
                submitted = []
                def owner_route(route):
                    endpoint = route.request.url.removeprefix("https://owner.example")
                    if endpoint == "/":
                        route.fulfill(status=200, content_type="text/html", body=owner_html)
                    elif endpoint == "/api/job/1493115":
                        route.fulfill(status=200, content_type="application/json", body=json.dumps(genuine))
                    elif endpoint == "/api/solve":
                        submitted.append(route.request.post_data_buffer)
                        route.fulfill(status=200, content_type="application/json", body=json.dumps({"subid":"123"}))
                    elif endpoint == "/api/submission/123":
                        route.fulfill(status=200, content_type="application/json", body=json.dumps({"receipt":genuine}))
                    else:
                        route.fulfill(status=404, content_type="application/json", body='{"error":"test route missing"}')
                owner.route("https://owner.example/**", owner_route)
                owner.goto("https://owner.example/")
                owner.locator("#job").fill("1493115")
                owner.locator("#inspect button").click()
                owner.locator("#result").wait_for(state="visible")
                assert "Leo Triplet" in owner.locator("#name").inner_text()
                owner.locator("#photo").set_input_files({"name":"test-sky.jpg","mimeType":"image/jpeg","buffer":b"synthetic-test-image-not-submitted-to-provider"})
                owner.locator("#consent").check()
                owner.locator("#solve button").click()
                owner.wait_for_function("document.querySelector('#status').textContent.startsWith('Solved.')")
                assert len(submitted) == 1
                assert b'test-sky.jpg' in submitted[0] and b'consent' in submitted[0]
                with owner.expect_download() as owner_download:
                    owner.locator("#download").click()
                assert owner_download.value.suggested_filename == "plate-solve-1493115.json"
                assert owner.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                owner.screenshot(path=str(screenshots / "owner-mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed: project subpath, real receipt, owner handoff, import, comparison, export and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
