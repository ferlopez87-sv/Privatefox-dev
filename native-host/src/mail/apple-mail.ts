import { execFile } from "node:child_process";

/**
 * Sends mail via the user's own Mail.app account by driving it with
 * AppleScript — zero stored credentials. Arguments are passed to
 * osascript as argv (never interpolated into the script source), so
 * subject/body/recipient content cannot inject script.
 */
const SCRIPT = `
on run argv
  set toAddr to item 1 of argv
  set theSubject to item 2 of argv
  set theBody to item 3 of argv
  tell application "Mail"
    set theMessage to make new outgoing message with properties {subject:theSubject, content:theBody, visible:false}
    tell theMessage
      make new to recipient at end of to recipients with properties {address:toAddr}
    end tell
    send theMessage
  end tell
end run
`;

export function sendViaAppleMail(
  to: string,
  subject: string,
  body: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", SCRIPT, to, subject, body],
      { timeout: 30_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `Mail.app send failed: ${stderr.trim() || error.message}`,
            ),
          );
        } else {
          resolve();
        }
      },
    );
  });
}
