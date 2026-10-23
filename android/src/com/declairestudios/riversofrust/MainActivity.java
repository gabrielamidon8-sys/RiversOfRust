package com.declairestudios.riversofrust;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.InputStream;

/**
 * RiversOfRust for Android: a full-screen, sideways WebView that runs the game from the app's own assets.
 * The game is served from a reserved https address so its modules, storage and audio behave like a normal web page,
 * but nothing is downloaded: it plays offline. Controllers go straight to the game (the browser's Gamepad API).
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String HOME = "https://" + HOST + "/index.html";
    static final int BG = 0xFF0D0E0F;

    WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        w.setBackgroundDrawable(new ColorDrawable(BG));
        w.setStatusBarColor(BG);
        w.setNavigationBarColor(BG);
        // use the whole screen, notch included (the game keeps its buttons clear of it)
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        web = new WebView(this);
        web.setBackgroundColor(BG);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // the game reads this to know it is the app (no "turn your phone" prompt, no full-screen button)
        s.setUserAgentString(s.getUserAgentString() + " RiversOfRustApp/" + versionName());
        web.setWebViewClient(new AssetClient());
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        web.requestFocus();
        refreshCacheOnUpdate();
        web.loadUrl(HOME);
    }

    String versionName() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; }
        catch (Exception e) { return "0"; }
    }

    /** After an app update, clear the WebView's cache once so nothing from the old version lingers. */
    @SuppressWarnings("deprecation")
    void refreshCacheOnUpdate() {
        try {
            int ver = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            SharedPreferences prefs = getSharedPreferences("rr", MODE_PRIVATE);
            if (prefs.getInt("ver", -1) != ver) {
                web.clearCache(true);
                prefs.edit().putInt("ver", ver).apply();
            }
        } catch (Exception e) { /* keep going with whatever cache there is */ }
    }

    static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    /** Serves the game from the app's assets; anything outside the app opens in the phone's browser. */
    class AssetClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.length() < 2) path = "/index.html";
            if (path.contains("..")) return notFound();
            String type = mime(path);
            try {
                InputStream in = getAssets().open("www" + path);
                boolean text = type.startsWith("text/") || type.equals("application/json") || type.equals("image/svg+xml");
                return new WebResourceResponse(type, text ? "UTF-8" : null, in);
            } catch (Exception e) {
                return notFound();
            }
        }

        WebResourceResponse notFound() {
            WebResourceResponse missing = new WebResourceResponse("text/plain", "UTF-8", null);
            missing.setStatusCodeAndReasonPhrase(404, "Not Found");
            return missing;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (HOST.equals(u.getHost())) return false;
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no browser */ }
            return true;
        }
    }

    /** A controller's buttons go to the game; without this Android turns the B button into "back" and leaves. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int src = e.getSource();
        boolean pad = KeyEvent.isGamepadButton(e.getKeyCode())
            || (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
            || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        if (pad && web != null) { web.dispatchKeyEvent(e); return true; }
        return super.dispatchKeyEvent(e);
    }

    /** The sticks and triggers. */
    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent e) {
        if (web != null && (e.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {
            web.dispatchGenericMotionEvent(e);
            return true;
        }
        return super.dispatchGenericMotionEvent(e);
    }

    /** Back puts a part down, leaves build mode or the test drive; in the garage it leaves the app. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.rrBack && window.rrBack()) ? 1 : 0", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String handled) {
                if (!"1".equals(handled)) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.evaluateJavascript("window.rrAppPause && window.rrAppPause()", null);
            web.onPause();
            web.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            web.evaluateJavascript("window.rrAppResume && window.rrAppResume()", null);
        }
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
