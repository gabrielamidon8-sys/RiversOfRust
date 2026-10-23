#!/usr/bin/env python3
"""Builds RiversOfRust for Android with Google's own tools (no Gradle): the game's files go into the app's assets,
aapt2 packs the manifest and icons, javac + d8 compile the small Java wrapper, zipalign aligns, apksigner signs (v1, v2
and v3 signatures) and verifies.

Needs: a JDK, Android build-tools 34+ and an android.jar (API 34+), and the signing key.
  RR_SDK=/path/with/build-tools-and-platform  (holds build-tools/ and android-35/android.jar; default /home/claude/androidsdk)
  RR_KEY=/path/to/riversofrust-signing-key.p12  RR_KEY_PASS=...   (the key never goes in the repository)
Run from anywhere: python3 android/build_apk.py   ->  android/out/RiversOfRust-<version>.apk"""
import glob, os, re, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SDK = os.environ.get('RR_SDK', '/home/claude/androidsdk')
BT = os.path.join(SDK, 'build-tools')
JAR = (glob.glob(os.path.join(SDK, 'android-3*', 'android.jar')) or [''])[-1]
KEY = os.environ.get('RR_KEY', '')
PASS = os.environ.get('RR_KEY_PASS', '')
B = os.path.join(HERE, 'build')
# what the game needs at run time; tests, tools and the Android sources stay out of the app
GAME = ['index.html', 'css', 'js', 'vendor', 'fonts']

def run(*a, env=None):
    r = subprocess.run(a, capture_output=True, text=True, env=env)
    if r.returncode: sys.exit('FAILED: ' + ' '.join(a) + '\n' + r.stdout + r.stderr)
    return r.stdout + r.stderr

def main():
    for need, what in ((JAR, 'android.jar'), (os.path.join(BT, 'aapt2'), 'aapt2'), (KEY, 'RR_KEY'), (PASS, 'RR_KEY_PASS')):
        if not need or (what != 'RR_KEY_PASS' and not os.path.exists(need)): sys.exit('Missing ' + what + ' (see the top of this file).')
    ver = re.search(r"VERSION = '([^']+)'", open(os.path.join(ROOT, 'js', 'config.js')).read()).group(1)
    major, minor, patch = (int(x) for x in ver.split('.'))
    code = major * 10000 + minor * 100 + patch          # 0.2.0 -> 200: every new version installs over the last
    shutil.rmtree(B, ignore_errors=True); os.makedirs(B)
    # 1. the game, as the app's assets
    www = os.path.join(B, 'assets', 'www'); os.makedirs(www)
    for g in GAME:
        src = os.path.join(ROOT, g)
        (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, os.path.join(www, g))
    for junk in glob.glob(os.path.join(www, '**', '*.d.ts'), recursive=True): os.remove(junk)
    # 2. resources and manifest
    run(os.path.join(BT, 'aapt2'), 'compile', '--dir', os.path.join(HERE, 'res'), '-o', os.path.join(B, 'res.zip'))
    base = os.path.join(B, 'base.apk')
    run(os.path.join(BT, 'aapt2'), 'link', '-o', base, '-I', JAR, '--manifest', os.path.join(HERE, 'AndroidManifest.xml'),
        '--min-sdk-version', '24', '--target-sdk-version', '34', '--version-code', str(code), '--version-name', ver,
        '-A', os.path.join(B, 'assets'), os.path.join(B, 'res.zip'))
    # 3. the Java wrapper
    cls = os.path.join(B, 'classes'); os.makedirs(cls)
    srcs = glob.glob(os.path.join(HERE, 'src', '**', '*.java'), recursive=True)
    run('javac', '--release', '11', '-Xlint:-options', '-cp', JAR, '-d', cls, *srcs)
    run(os.path.join(BT, 'd8'), '--release', '--min-api', '24', '--lib', JAR, '--output', B, *glob.glob(os.path.join(cls, '**', '*.class'), recursive=True))
    with zipfile.ZipFile(base, 'a', zipfile.ZIP_DEFLATED) as z: z.write(os.path.join(B, 'classes.dex'), 'classes.dex')
    # 4. align, sign, check
    out = os.path.join(HERE, 'out'); os.makedirs(out, exist_ok=True)
    aligned = os.path.join(B, 'aligned.apk'); apk = os.path.join(out, 'RiversOfRust-%s.apk' % ver)
    run(os.path.join(BT, 'zipalign'), '-f', '-p', '4', base, aligned)
    env = dict(os.environ, RR_KEY_PASS=PASS)
    run(os.path.join(BT, 'apksigner'), 'sign', '--ks', KEY, '--ks-type', 'PKCS12', '--ks-pass', 'env:RR_KEY_PASS',
        '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--out', apk, aligned, env=env)
    print(run(os.path.join(BT, 'apksigner'), 'verify', '--verbose', '--print-certs', apk).strip())
    print('built', apk, '%.1f MB' % (os.path.getsize(apk) / 1048576), 'version', ver, 'code', code)

if __name__ == '__main__':
    main()
