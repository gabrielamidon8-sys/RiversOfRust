"""Opens the game in a headless Chromium (software WebGL), builds the car through the real UI, takes it for a drive
and saves screenshots. Run from the repo root: python3 tests/browser_check.py [port]"""
import sys, time, json, os, subprocess, signal
from playwright.sync_api import sync_playwright

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
OUT = os.path.join(os.path.dirname(__file__), '..', '_shots')
os.makedirs(OUT, exist_ok=True)
CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=os.path.join(os.path.dirname(__file__), '..'), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors, logs = [], []
fails = 0
def ok(c, msg):
    global fails
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: fails += 1
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        pg = b.new_page(viewport={'width': 1600, 'height': 900})
        pg.on('console', lambda m: (errors if m.type == 'error' else logs).append(m.text))
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.add_init_script('window.RR_TEST = true; if (!sessionStorage.getItem("rr_t")) { localStorage.clear(); sessionStorage.setItem("rr_t", "1"); }')
        pg.goto(f'http://localhost:{PORT}/index.html')
        pg.wait_for_function('window.RR && document.getElementById("boot").classList.contains("gone")', timeout=120000)
        time.sleep(1.5)
        pg.screenshot(path=f'{OUT}/01-garage.png')
        ok(pg.evaluate('document.querySelectorAll(".part").length') == 6, 'six kinds of part in the panel')
        ok('locked' in pg.get_attribute('#tabDrive', 'class'), 'test drive starts locked')
        # build mode, then the frame through the real UI: press on the panel item, click on the car
        pg.click('#build'); time.sleep(0.5)
        pg.click('.part[data-key="frame"]'); time.sleep(0.2)
        pos = pg.evaluate('RR.builder.screenOf("frame", "lift")')
        pg.mouse.move(pos['x'], pos['y']); time.sleep(0.2); pg.mouse.down(); pg.mouse.up(); time.sleep(1.2)
        placed = pg.evaluate('RR.builder.placed.map(p => p.key)')
        ok(placed == ['frame'], 'frame bolts onto the lift with a click (%s)' % placed)
        pg.screenshot(path=f'{OUT}/02-frame-on-lift.png')
        # pick up the body and hover near the deck: the ghost should snap
        pg.click('.part[data-key="body"]')
        pos = pg.evaluate('RR.builder.screenOf("body", "deck:-1")')
        pg.mouse.move(pos['x'] + 5, pos['y'] + 5); time.sleep(0.4)
        pg.screenshot(path=f'{OUT}/03-body-ghost-snapped.png')
        pg.mouse.down(); pg.mouse.up(); time.sleep(0.8)
        # the turret is locked until the body is on (it is now), so try a wheel
        for key, sock in [('engine', 'well'), ('wheelS', 'mount:FL')]:
            pg.click(f'.part[data-key="{key}"]')
            pos = pg.evaluate(f'RR.builder.screenOf("{key}", "{sock}")')
            pg.mouse.move(pos['x'], pos['y']); time.sleep(0.3); pg.mouse.down(); pg.mouse.up(); time.sleep(0.7)
        placed = pg.evaluate('RR.builder.placed.map(p => p.key + "@" + p.socket)')
        ok('engine@well' in placed and 'wheelS@mount:FL' in placed and any(x.startswith('body@deck') for x in placed), 'body, engine and a wheel bolt on (%s)' % placed)
        ok(pg.evaluate('RR.builder.holding') == 'wheelS', 'after one steering wheel the second is picked up straight away')
        pg.screenshot(path=f'{OUT}/04-partway.png')
        # take the body off: it comes back to the hand
        # finish the rest with the test helper, then look at the finished car on the lift
        pg.keyboard.press('Escape'); time.sleep(0.2)
        pg.evaluate('RR.builder.autoBuild()'); time.sleep(1.5)
        ok(pg.evaluate('RR.builder.complete()'), 'car complete')
        ok('ready' in pg.get_attribute('#tabDrive', 'class'), 'test drive tab unlocks')
        ok(not pg.is_hidden('#doneCard'), 'the panel shows the ready card')
        pg.evaluate('RR.controls.autoRotate=false; RR.camera.position.set(4.6, 2.6, 5.2)'); time.sleep(1.0)
        pg.screenshot(path=f'{OUT}/05-complete-build-mode.png')
        pg.click('#build'); pg.evaluate('RR.builder.settle(4)'); time.sleep(1.0)
        pg.screenshot(path=f'{OUT}/06-complete-on-wheels.png')
        # drive
        pg.click('#tabDrive'); time.sleep(2.0)
        ok(pg.evaluate('RR.drive.active'), 'test drive starts')
        pg.screenshot(path=f'{OUT}/07-drive-start.png')
        pg.evaluate('RR.drive.simulate(4, {up: true})')
        kmh = pg.evaluate('RR.drive.car.state.kmh'); z = pg.evaluate('RR.drive.car.body.position.z')
        ok(kmh > 30 and z > 10, f'W drives it ({kmh:.0f} km/h after 4 s, {z:.1f} m)')
        pg.evaluate('RR.drive.simulate(1.5, {up: true, left: true})'); time.sleep(0.8)
        pg.screenshot(path=f'{OUT}/08-driving.png')
        x = pg.evaluate('RR.drive.car.body.position.x')
        ok(x > 1, f'A turns left ({x:.1f} m to the left)')
        # real keys reach the car too
        pg.keyboard.down('w'); time.sleep(0.3); held = pg.evaluate('RR.drive.keys.up'); pg.keyboard.up('w'); time.sleep(0.2)
        ok(held is True and pg.evaluate('RR.drive.keys.up') is False, 'the real W key reaches the car (held %s)' % held)
        pg.evaluate('RR.drive.simulate(1.0, {})')
        pg.mouse.move(800, 400); pg.mouse.down(); pg.evaluate('RR.drive.simulate(0.5, {})'); pg.mouse.up()
        pg.screenshot(path=f'{OUT}/09-firing.png')
        core = pg.evaluate('RR.core()')
        print('   CORE:', ', '.join(f"{e['name']} {e['health']} {e['ms']}ms errs {e['errs']}" for e in core))
        ok(all(e['errs'] == 0 for e in core), 'no engine reported errors')
        pg.keyboard.press('Tab'); time.sleep(1.0)
        ok(not pg.evaluate('RR.drive.active'), 'Tab goes back to the garage')
        # reload keeps the car
        pg.reload(); pg.wait_for_function('window.RR && document.getElementById("boot").classList.contains("gone")', timeout=120000)
        ok(pg.evaluate('RR.builder.complete()'), 'the car is still built after a reload')
        fps = pg.evaluate('new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })')
        print(f'   software-rendered fps (not representative of a GPU): {fps:.0f}')
        b.close()
finally:
    srv.send_signal(signal.SIGTERM)
errs = [e for e in errors if 'favicon' not in e]
ok(not errs, 'no console errors' + ('' if not errs else ': ' + json.dumps(errs[:8])))
print('\n%d FAILED' % fails if fails else '\nall passed')
sys.exit(1 if fails else 0)
