package gh.rova.diagnostics

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

// No handler, background tracker, permission, trace stream, PID or movement history.
// JS invokes this only after diagnostic consent and transmits aggregate counters only.
class RovaDiagnosticsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RovaDiagnostics")
    AsyncFunction("readExitCounts") { since: Double ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val now = System.currentTimeMillis()
      require(since.isFinite() && since > 0 && since <= now + 2000) { "Invalid diagnostic watermark" }
      val info = context.packageManager.getPackageInfo(context.packageName, 0)
      val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode.toString() else info.versionCode.toString()
      val variant = when (context.packageName) {
        "gh.rova.mobile.dev" -> "development"
        "gh.rova.mobile.preview" -> "preview"
        "gh.rova.mobile" -> "production"
        else -> "unknown"
      }
      var javaCrashes = 0; var nativeCrashes = 0; var anrs = 0; var truncated = false
      if (Build.VERSION.SDK_INT >= 30) {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val records = manager.getHistoricalProcessExitReasons(context.packageName, 0, 32)
        truncated = records.size == 32
        val cutoff = maxOf(since.toLong(), now - 7L * 86400000L)
        for (exit in records) {
          if (exit.processName != context.packageName || exit.timestamp <= cutoff || exit.timestamp > now) continue
          when (exit.reason) {
            ApplicationExitInfo.REASON_CRASH -> javaCrashes++
            ApplicationExitInfo.REASON_CRASH_NATIVE -> nativeCrashes++
            ApplicationExitInfo.REASON_ANR -> anrs++
          }
        }
      }
      mapOf("supported" to (Build.VERSION.SDK_INT >= 30), "watermark" to now.toDouble(),
        "javaCrashes" to javaCrashes, "nativeCrashes" to nativeCrashes, "anrs" to anrs,
        "truncated" to truncated, "version" to (info.versionName ?: "unknown"), "build" to code, "variant" to variant)
    }
  }
}
