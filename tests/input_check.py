"""Plays RiversOfRust with touch on an emulated phone (sideways and upright) and with a simulated Xbox controller,
through the real UI, and checks the game switches to whatever was used last. Screenshots go to _shots/.
Run from the repo root: python3 tests/input_check.py [port]"""
import sys, time, json, os, subprocess, signal
from playwright.sync_api import sync_playwright

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, '_shots'); os.makedirs(OUT, exist_ok=True)
CHROME = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
URL = f'http://localhost:{PORT}/index.html'
fails = 0
def ok(c, msg):
    global fails
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: fails += 1
FRESH = 'window.RR_TEST = true; if (!sessionStorage.getItem("rr_t")) { localStorage.clear(); sessionStorage.setItem("rr_t", "1"); }'
READY = 'window.RR && document.getElementById("boot").classList.contains("gone")'
frames = lambda pg, n=3: pg.evaluate(f'new Promise(r => {{ let k = {n}; const f = () => --k <= 0 ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }})')

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=ARGS)

        # ================= touch, phone held sideways =================
        ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); cdp = ctx.new_cdp_session(pg)
        pg.on('console', lambda m: m.type == 'error' and errors.append('touch: ' + m.text))
        pg.on('pageerror', lambda e: errors.append('touch pageerror: ' + str(e)))
        pg.add_init_script(FRESH)
        pg.goto(URL); pg.wait_for_function(READY, timeout=180000); time.sleep(1)
        print('   phone detected as mobile:', pg.evaluate('RR.IN.mobile'), ' pixel ratio', pg.evaluate('RR.ratio()'))
        pg.screenshot(path=f'{OUT}/m1-phone-garage.png')
        pg.tap('#build'); time.sleep(0.3)
        ok(pg.evaluate('document.documentElement.dataset.input') == 'touch', 'a tap switches the game to touch')
        def tap_part(key, sock):
            pg.tap(f'.part[data-key="{key}"]'); time.sleep(0.25)
            pos = pg.evaluate(f'RR.builder.screenOf("{key}", "{sock}")')
            pg.touchscreen.tap(pos['x'], pos['y']); time.sleep(0.45)
        tap_part('frame', 'lift')
        ok(pg.evaluate('RR.builder.placed.map(p => p.key)') == ['frame'], 'tap the Frame, tap the lift: it bolts on')
        pg.tap('.part[data-key="body"]'); time.sleep(0.3)
        ok(pg.evaluate('RR.builder.holding') == 'body', 'tapping a part picks it up (the ghost waits on a spot)')
        pg.screenshot(path=f'{OUT}/m2-phone-holding-body.png')
        pos = pg.evaluate('RR.builder.screenOf("body", "deck:-1")'); pg.touchscreen.tap(pos['x'], pos['y']); time.sleep(0.45)
        tap_part('engine', 'well')
        tap_part('wheelS', 'mount:FL')
        ok(pg.evaluate('RR.builder.holding') == 'wheelS', 'the second steering wheel comes straight to hand')
        pos = pg.evaluate('RR.builder.screenOf("wheelS", "mount:FR")'); pg.touchscreen.tap(pos['x'], pos['y']); time.sleep(0.45)
        tap_part('wheelD', 'mount:RL')
        pos = pg.evaluate('RR.builder.screenOf("wheelD", "mount:RR")'); pg.touchscreen.tap(pos['x'], pos['y']); time.sleep(0.45)
        tap_part('turret', 'roof:0')
        placed = pg.evaluate('RR.builder.placed.map(p => p.key + "@" + p.socket)')
        ok(pg.evaluate('RR.builder.complete()'), 'the whole car is built with taps (%s)' % ', '.join(placed))
        pg.tap('#build'); pg.evaluate('RR.builder.settle(4)'); time.sleep(0.8)
        pg.screenshot(path=f'{OUT}/m3-phone-built.png')
        pg.tap('#tabDrive'); time.sleep(1.2)
        ok(pg.evaluate('RR.drive.active'), 'tapping Test drive starts the drive')
        ok(pg.is_visible('#tFire') and pg.is_visible('#tLeft') and not pg.is_visible('#keys'), 'the touch controls show, the keyboard legend hides')
        pg.screenshot(path=f'{OUT}/m4-phone-drive.png')
        # the left thumb pushes the stick up: gas
        L = pg.evaluate('(() => { const r = document.getElementById("tLeft").getBoundingClientRect(); return { x: r.left + r.width * 0.35, y: r.top + r.height * 0.7 }; })()')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': L['x'], 'y': L['y'], 'id': 1}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': L['x'], 'y': L['y'] - 70, 'id': 1}]})
        # touch moves reach the page with the next frame, and a software-rendered frame is slow: wait for it
        pg.wait_for_function('RR.drive.touch.gas > 0.5', timeout=20000)
        st = pg.evaluate('({ gas: RR.drive.touch.gas, steer: RR.drive.touch.steer })')
        ok(st['gas'] > 0.8 and abs(st['steer']) < 0.1, f'stick pushed up reads as gas ({st})')
        pg.evaluate('RR.drive.simulate(3, {})')
        kmh = pg.evaluate('RR.drive.car.state.kmh'); z = pg.evaluate('RR.drive.car.body.position.z')
        ok(kmh > 25 and z > 5, f'the touch stick drives the car ({kmh:.0f} km/h, {z:.1f} m)')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': L['x'] - 60, 'y': L['y'] - 40, 'id': 1}]})
        pg.wait_for_function('RR.drive.touch.steer > 0.5', timeout=20000); x0 = pg.evaluate('RR.drive.car.body.position.x')
        pg.evaluate('RR.drive.simulate(1.5, {})')
        ok(pg.evaluate('RR.drive.car.body.position.x') > x0 + 1, 'stick to the left steers left')
        # the right thumb holds FIRE and drags to aim, while the left still drives
        F = pg.evaluate('(() => { const r = document.getElementById("tFire").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()')
        yaw0 = pg.evaluate('RR.drive.view().yaw'); s0 = pg.evaluate('RR.drive.shots')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': L['x'] - 60, 'y': L['y'] - 40, 'id': 1}, {'x': F['x'], 'y': F['y'], 'id': 2}]})
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': L['x'] - 60, 'y': L['y'] - 40, 'id': 1}, {'x': F['x'] - 80, 'y': F['y'], 'id': 2}]})
        pg.wait_for_function('RR.drive.touch.fire', timeout=20000); frames(pg, 3); pg.evaluate('RR.drive.simulate(0.8, {})'); time.sleep(0.3)
        pg.screenshot(path=f'{OUT}/m5-phone-firing.png')
        ok(pg.evaluate('RR.drive.shots') > s0 + 3, 'holding FIRE fires (two thumbs at once)')
        ok(abs(pg.evaluate('RR.drive.view().yaw') - yaw0) > 0.2, 'sliding the thumb on FIRE turns the camera and the turret')
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_function('!RR.drive.touch.fire', timeout=20000)
        ok(pg.evaluate('RR.drive.touch.gas') == 0 and not pg.evaluate('RR.drive.touch.fire'), 'letting go stops the car and the gun')
        pg.tap('#back'); time.sleep(0.6)
        ok(not pg.evaluate('RR.drive.active'), 'the Garage button goes back')
        ok(pg.evaluate('window.rrBack()') in (True, False), 'the Android back button hook is there')

        # ================= touch, phone held upright =================
        pg.set_viewport_size({'width': 390, 'height': 844}); pg.wait_for_function('innerWidth < innerHeight', timeout=20000); frames(pg, 3)
        pg.screenshot(path=f'{OUT}/m6-phone-portrait-garage.png')
        pg.tap('#tabDrive'); frames(pg, 3)
        ok(pg.is_visible('#rotate'), 'driving upright in a browser asks to turn the phone')
        pg.screenshot(path=f'{OUT}/m7-phone-portrait-rotate.png')
        pg.set_viewport_size({'width': 844, 'height': 390}); pg.wait_for_function('innerWidth > innerHeight', timeout=20000); frames(pg, 3)
        ok(not pg.is_visible('#rotate'), 'turned sideways: the prompt goes')
        pg.evaluate('RR.toGarage()')
        ctx.close()

        # ================= a controller =================
        PAD = """
          window.__pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
            axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
            vibrationActuator: { playEffect() { window.__rumbles = (window.__rumbles || 0) + 1; return Promise.resolve('complete'); } } };
          window.__padOn = true;
          Object.defineProperty(navigator, 'getGamepads', { value: () => window.__padOn ? [window.__pad, null, null, null] : [null, null, null, null], configurable: true });
          window.__set = (i, v) => { const b = window.__pad.buttons[i]; b.value = v; b.pressed = v > 0.5; };
        """
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        pg = ctx.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append('pad: ' + m.text))
        pg.on('pageerror', lambda e: errors.append('pad pageerror: ' + str(e)))
        pg.add_init_script(FRESH); pg.add_init_script(PAD)
        pg.goto(URL); pg.wait_for_function(READY, timeout=180000); time.sleep(1)
        ok(pg.evaluate('document.documentElement.dataset.input') == 'kbm', 'a desktop starts on keyboard and mouse')
        def press(i, n=1):
            for _ in range(n):
                pg.evaluate(f'__set({i}, 1)'); frames(pg, 2); pg.evaluate(f'__set({i}, 0)'); frames(pg, 2)
        A, Bb, X, Y, LB, RB, LT, RT, VIEW, MENU, UP, DOWN = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13
        press(DOWN); press(UP)
        ok(pg.evaluate('document.documentElement.dataset.input') == 'pad', 'touching the controller switches to it')
        ok('pb' in pg.inner_html('#hint'), 'the hints show controller buttons')
        ok('>A</kbd>' in pg.inner_html('#hint') and '>✕<' not in pg.inner_html('#hint'), 'an Xbox controller gets Xbox buttons (A, not ✕)')
        press(A); ok(pg.evaluate('RR.builder.holding') == 'frame', 'A picks up the highlighted part (the Frame)')
        press(A); ok(pg.evaluate('RR.builder.placed.map(p => p.key)') == ['frame'], 'A again bolts it on')
        press(A); ok(pg.evaluate('RR.builder.holding') == 'body', 'the next part in the list is ready (Half body)')
        press(RB); frames(pg, 2)
        pg.screenshot(path=f'{OUT}/p1-pad-cycle-spot.png')
        press(LB); press(A)
        ok('body@deck:-1' in pg.evaluate('RR.builder.placed.map(p => p.key + "@" + p.socket)'), 'RB / LB move it between spots, A bolts it where it is')
        press(A); press(A)                      # engine
        press(A); press(A); time.sleep(0.2); press(A)    # both steering wheels (the second comes to hand by itself)
        press(A); press(A); time.sleep(0.2); press(A)    # both drive wheels
        press(A); press(A)                      # turret
        placed = pg.evaluate('RR.builder.placed.map(p => p.key + "@" + p.socket)')
        ok(pg.evaluate('RR.builder.complete()'), 'the whole car is built with the controller (%s)' % ', '.join(placed))
        ok('wheelS@mount:FL' in placed and 'wheelS@mount:FR' in placed and 'wheelD@mount:RL' in placed, 'steering wheels went to the front, drive wheels to the back')
        ok((pg.evaluate('window.__rumbles') or 0) > 0, 'the controller rumbles when a part goes on')
        press(LB); ok(pg.evaluate('RR.builder.selected') == 'turret', 'LB chooses a part on the car (the turret)')
        press(X); ok(pg.evaluate('RR.builder.holding') == 'turret' and not pg.evaluate('RR.builder.complete()'), 'X takes it off')
        press(Bb); press(A); press(A)
        ok(pg.evaluate('RR.builder.complete()'), 'B puts it back on the shelf; A, A fits it again')
        pg.evaluate('RR.builder.setBuildMode(false); RR.builder.settle(4)'); time.sleep(0.5)
        pg.screenshot(path=f'{OUT}/p2-pad-garage.png')
        press(MENU); time.sleep(0.8)
        ok(pg.evaluate('RR.drive.active'), 'Menu starts the test drive')
        ok('pb' in pg.inner_html('#keys'), 'the drive shows the controller layout')
        pg.evaluate(f'__set({RT}, 1)'); frames(pg, 2)
        pg.evaluate('RR.drive.simulate(3, {})')
        kmh = pg.evaluate('RR.drive.car.state.kmh')
        ok(kmh > 30, f'RT is the gas ({kmh:.0f} km/h after 3 s)')
        pg.evaluate('__pad.axes[0] = -1'); frames(pg, 2); x0 = pg.evaluate('RR.drive.car.body.position.x')
        pg.evaluate('RR.drive.simulate(1.5, {})')
        ok(pg.evaluate('RR.drive.car.body.position.x') > x0 + 1, 'left stick steers')
        pg.evaluate(f'__pad.axes[0] = 0; __set({RT}, 0); __set({RB}, 1)'); frames(pg, 2); s0 = pg.evaluate('RR.drive.shots')
        pg.evaluate('__pad.axes[2] = 0.8'); frames(pg, 2); yaw0 = pg.evaluate('RR.drive.view().yaw')
        pg.evaluate('RR.drive.simulate(0.8, {})'); time.sleep(0.3)
        pg.screenshot(path=f'{OUT}/p3-pad-drive-firing.png')
        ok(pg.evaluate('RR.drive.shots') > s0 + 3, 'RB fires')
        ok(abs(pg.evaluate('RR.drive.view().yaw') - yaw0) > 0.3, 'the right stick aims')
        pg.evaluate(f'__set({RB}, 0); __pad.axes[2] = 0'); frames(pg, 2)
        pg.evaluate(f'__set({LT}, 1)'); frames(pg, 2); pg.evaluate('RR.drive.simulate(5, {})')
        ok(pg.evaluate('RR.drive.car.state.gear') == 'R', 'LT brakes, then reverses')
        pg.evaluate(f'__set({LT}, 0)'); frames(pg, 2)
        press(VIEW); time.sleep(0.5)
        ok(not pg.evaluate('RR.drive.active'), 'View goes back to the garage')
        pg.evaluate('window.__padOn = false'); frames(pg, 4)
        ok(pg.evaluate('document.documentElement.dataset.input') == 'kbm', 'unplugging the controller goes back to keyboard and mouse')
        pg.evaluate('window.__padOn = true'); press(A); pg.mouse.move(300, 300); pg.mouse.move(420, 380); pg.mouse.move(520, 300); time.sleep(0.2)
        ok(pg.evaluate('document.documentElement.dataset.input') == 'kbm', 'moving the mouse takes over from the controller')
        ctx.close(); b.close()
finally:
    srv.send_signal(signal.SIGTERM)
errs = [e for e in errors if 'favicon' not in e]
ok(not errs, 'no console errors' + ('' if not errs else ': ' + json.dumps(errs[:8])))
print('\n%d FAILED' % fails if fails else '\nall passed')
sys.exit(1 if fails else 0)
