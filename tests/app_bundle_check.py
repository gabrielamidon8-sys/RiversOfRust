"""Runs the exact game files packed into the APK (android/build/assets/www) in a phone-sized browser that says it is
the app, and checks: every file is there, the app-only behaviour (no full-screen button, no turn-your-phone prompt)
and the Android back button. Run after android/build_apk.py: python3 tests/app_bundle_check.py [port]"""
import sys, time, json, os, subprocess, signal
from playwright.sync_api import sync_playwright

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8768
WWW = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'android', 'build', 'assets', 'www')
CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'
UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 RiversOfRustApp/0.2.0'
fails = 0
def ok(c, msg):
    global fails
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: fails += 1
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=WWW, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors, missing = [], []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        ctx = b.new_context(viewport={'width': 800, 'height': 360}, device_scale_factor=2.6, is_mobile=True, has_touch=True, user_agent=UA)
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('response', lambda r: r.status >= 400 and missing.append(r.url))
        pg.add_init_script('window.RR_TEST = true; localStorage.clear();')
        pg.goto(f'http://localhost:{PORT}/index.html')
        pg.wait_for_function('window.RR && document.getElementById("boot").classList.contains("gone")', timeout=180000)
        ok(not missing, 'every file the game asks for is in the app' + ('' if not missing else ': ' + ', '.join(missing)))
        ok(pg.evaluate('RR.IN.app') and pg.evaluate('RR.IN.mobile'), 'the game knows it is the phone app')
        ok(pg.is_hidden('#fs'), 'no full-screen button in the app (it is always full screen)')
        ok(pg.evaluate('window.rrBack()') is False, 'Back in the garage leaves the app')
        pg.tap('.part[data-key="frame"]'); time.sleep(0.3)
        ok(pg.evaluate('window.rrBack()') is True and not pg.evaluate('RR.builder.holding'), 'Back puts the part in your hand down first')
        pg.evaluate('RR.builder.autoBuild()'); pg.tap('#tabDrive'); time.sleep(1)
        ok(pg.evaluate('RR.drive.active'), 'the test drive runs from the app files')
        pg.set_viewport_size({'width': 360, 'height': 800}); pg.wait_for_function('innerWidth < innerHeight'); time.sleep(0.5)
        ok(pg.is_hidden('#rotate'), 'no turn-your-phone prompt in the app (Android keeps it sideways)')
        ok(pg.evaluate('window.rrBack()') is True and not pg.evaluate('RR.drive.active'), 'Back leaves the test drive for the garage')
        b.close()
finally:
    srv.send_signal(signal.SIGTERM)
errs = [e for e in errors if 'favicon' not in e]
ok(not errs, 'no console errors' + ('' if not errs else ': ' + json.dumps(errs[:6])))
print('\n%d FAILED' % fails if fails else '\nall passed')
sys.exit(1 if fails else 0)
