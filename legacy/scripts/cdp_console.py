#!/usr/bin/env python3
"""通过 CDP 读取 Capacitor WebView 的 console 日志与页面状态。
用法: python scripts/cdp_console.py <adb-path> <package> [等待秒数]
前置: APK 以 webContentsDebuggingEnabled=true 构建并安装;应用在前台。
依赖: pip install websocket-client
"""
import json
import os
import subprocess
import sys
import time
import urllib.request

import websocket

adb, pkg = sys.argv[1], sys.argv[2]
wait = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
serial = os.environ.get('ADB_SERIAL')
base = [adb] + (['-s', serial] if serial else [])

pid = subprocess.run(base + ['shell', 'pidof', pkg], capture_output=True, text=True).stdout.strip()
if not pid:
    print('app not running'); sys.exit(1)
subprocess.run(base + ['forward', 'tcp:9333', f'localabstract:webview_devtools_remote_{pid}'],
               capture_output=True)
with urllib.request.urlopen('http://127.0.0.1:9333/json', timeout=8) as r:
    pages = json.load(r)
target = next((p for p in pages if p.get('type') == 'page'), pages[0] if pages else None)
if not target:
    print('no debuggable page'); sys.exit(1)
print('PAGE:', target.get('url'))

ws = websocket.create_connection(target['webSocketDebuggerUrl'], timeout=10, suppress_origin=True)
ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
ws.send(json.dumps({'id': 2, 'method': 'Log.enable'}))
ws.send(json.dumps({'id': 4, 'method': 'Page.enable'}))
ws.send(json.dumps({'id': 5, 'method': 'Page.reload'}))
ws.send(json.dumps({'id': 3, 'method': 'Runtime.evaluate',
                    'params': {'expression': 'document.readyState + " | #app children=" + document.getElementById("app").children.length + " | title=" + document.title'}}))
deadline = time.time() + wait
while time.time() < deadline:
    try:
        ws.settimeout(max(0.1, deadline - time.time()))
        msg = json.loads(ws.recv())
    except Exception:
        break
    m = msg.get('method')
    if m == 'Runtime.consoleAPICalled':
        p = msg['params']
        print('CONSOLE[%s]: %s' % (p.get('type'), ' '.join(
            str(a.get('value', a.get('description', ''))) for a in p.get('args', []))))
    elif m == 'Log.entryAdded':
        e = msg['params']['entry']
        print('LOG[%s/%s]: %s %s' % (e.get('source'), e.get('level'), e.get('url', ''), e.get('text', '')))
    elif m == 'Runtime.exceptionThrown':
        d = msg['params']['exceptionDetails']
        print('EXCEPTION:', d.get('text'), d.get('exception', {}).get('description', '')[:600])
    elif msg.get('id') == 3:
        print('STATE:', msg.get('result', {}).get('result', {}).get('value'))
ws.close()
