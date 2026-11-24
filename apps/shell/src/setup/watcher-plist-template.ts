/*
 * launchd user agent of the EngineOS Video Creator watcher, packaged app variant (plan section 5
 * step 6). Same label and restart policy as `apps/watcher/launchd/com.videostudio.watcher.plist.template`
 * (keep the two in step); only the paths and PATH differ: every path points inside the installed app,
 * and PATH holds the bundled runtime folders and `/usr/bin:/bin`, never Homebrew or an inherited tail.
 *
 * Embedded in the shell bundle, so it is covered by the asar integrity fuse and needs no staging.
 * `plist-render.ts` substitutes the placeholders with checked, XML-escaped values:
 *
 *   __NODE_BIN__      bundled node binary
 *   __WATCHER_MAIN__  bundled watcher entry (payload/watcher/dist/main.js)
 *   __WORKING_DIR__   bundled watcher payload folder
 *   __LOGS_DIR__      <data home>/logs (D5, owner-only)
 *   __API_PORT__ / __WEB_PORT__  studio ports, 1024 to 65535
 *   __RUNTIME_DIR__   the app's runtime folder (ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR)
 *   __PATH__          bundled bin folders, then /usr/bin:/bin
 *   __APP_VERSION__   version that rendered the file; an upgrade re-renders and restarts the agent
 *
 * PRD section 12: no secret here. Provider keys stay in the Keychain, the passphrase hash in the database.
 */
export const WATCHER_PLIST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Rendered by Video Studio __APP_VERSION__ -->
  <key>Label</key>
  <string>com.videostudio.watcher</string>

  <key>ProgramArguments</key>
  <array>
    <string>__NODE_BIN__</string>
    <string>__WATCHER_MAIN__</string>
  </array>

  <key>WorkingDirectory</key>
  <string>__WORKING_DIR__</string>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>ThrottleInterval</key>
  <integer>30</integer>

  <key>ExitTimeOut</key>
  <integer>30</integer>

  <key>ProcessType</key>
  <string>Background</string>

  <key>Umask</key>
  <integer>63</integer>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>__PATH__</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR</key>
    <string>__RUNTIME_DIR__</string>
    <key>ENGINEOS_VIDEO_CREATOR_API_PORT</key>
    <string>__API_PORT__</string>
    <key>ENGINEOS_VIDEO_CREATOR_WEB_PORT</key>
    <string>__WEB_PORT__</string>
  </dict>

  <key>StandardOutPath</key>
  <string>__LOGS_DIR__/watcher.launchd.log</string>

  <key>StandardErrorPath</key>
  <string>__LOGS_DIR__/watcher.launchd.log</string>
</dict>
</plist>
`;
