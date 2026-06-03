/**
 * Lightweight structured logger. Usage: const log = makeLogger('useBookManager');
 * In Electron, errors are also forwarded to the main process via IPC for potential
 * file-based logging. In the browser, all output goes to the console only.
 */

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;

function send(level, context, msg, extra) {
  const tag = `[${level.toUpperCase()}] [${context}]`;
  if (level === 'error') {
    console.error(tag, msg, extra ?? '');
    // Forward to Electron main process if available (for future file logging)
    if (isElectron && window.electronAPI?.logError) {
      window.electronAPI.logError({ context, msg, extra: String(extra ?? '') });
    }
  } else if (level === 'warn') {
    console.warn(tag, msg, extra ?? '');
  } else {
    console.info(tag, msg, extra ?? '');
  }
}

export default function makeLogger(context) {
  return {
    info:  (msg, extra) => send('info',  context, msg, extra),
    warn:  (msg, extra) => send('warn',  context, msg, extra),
    error: (msg, extra) => send('error', context, msg, extra),
  };
}
