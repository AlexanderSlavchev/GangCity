package com.gangcity.game

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var fellBack = false
    private var rewardedAd: RewardedAd? = null

    companion object {
        // Хибриден режим: първо сайтът (винаги последната версия),
        // при липса на интернет или грешка — вградената в APK-то игра.
        const val REMOTE_URL = "https://alexanderslavchev.github.io/GangCity/web/"
        const val LOCAL_URL = "file:///android_asset/index.html"

        // ТЕСТОВО ID на Google за rewarded реклами. Работи веднага, но не носи
        // пари. Смени с истинското от AdMob (Apps -> Ad units) при пускане.
        const val REWARDED_AD_UNIT = "ca-app-pub-3940256099942544/5224354917"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        MobileAds.initialize(this) {}
        loadRewarded()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            setBackgroundColor(0xFF0A0A12.toInt())
            addJavascriptInterface(AdsInterface(), "AndroidAds")
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView, request: WebResourceRequest, error: WebResourceError
                ) {
                    if (request.isForMainFrame) fallBackToLocal()
                }

                override fun onReceivedHttpError(
                    view: WebView, request: WebResourceRequest, response: WebResourceResponse
                ) {
                    if (request.isForMainFrame) fallBackToLocal()
                }
            }
            loadUrl(if (isOnline()) REMOTE_URL else LOCAL_URL)
        }
        setContentView(webView)
        hideSystemUi()
    }

    /** Мостът, който играта вижда като window.AndroidAds */
    inner class AdsInterface {
        @JavascriptInterface
        fun isReady(): Boolean = rewardedAd != null

        @JavascriptInterface
        fun show(hook: String) {
            runOnUiThread {
                val ad = rewardedAd ?: return@runOnUiThread
                rewardedAd = null
                ad.show(this@MainActivity, OnUserEarnedRewardListener {
                    // Наградата се дава само при изгледана реклама
                    val safe = hook.replace(Regex("[^a-z_]"), "")
                    webView.evaluateJavascript(
                        "window.onAdReward && window.onAdReward('" + safe + "')", null
                    )
                })
                loadRewarded()   // зареждаме следващата отрано
            }
        }
    }

    private fun loadRewarded() {
        RewardedAd.load(
            this, REWARDED_AD_UNIT, AdRequest.Builder().build(),
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) { rewardedAd = ad }
                override fun onAdFailedToLoad(error: LoadAdError) { rewardedAd = null }
            }
        )
    }

    private fun fallBackToLocal() {
        if (fellBack) return
        fellBack = true
        webView.loadUrl(LOCAL_URL)
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun hideSystemUi() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }
}
