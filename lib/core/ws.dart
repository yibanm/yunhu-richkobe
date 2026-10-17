import 'dart:async';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// 云湖实时通道（clean-room）。
/// 协议：JSON 帧。
///   1) 连接后先发 {seq, cmd:'login', data:{userId, token, platform, deviceId}}
///   2) 心跳 {seq, cmd:'heartbeat', data:{}}，默认 25s
///   3) 服务端推送 cmd: push_message / edit_message / stream_message /
///      draft_input / heartbeat_ack / invite_apply …
class YunhuWs {
  YunhuWs({this.heartbeatMs = 25000});

  final int heartbeatMs;
  WebSocketChannel? _ch;
  Timer? _hb;
  int _seq = 0;
  bool _manualClose = false;
  Duration _retry = const Duration(seconds: 2);

  String url = 'wss://chat-ws-go.jwzhd.com/ws';
  String userId = '';
  String token = '';
  String deviceId = '';

  final _events = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get events => _events.stream;

  final _status = ValueNotifierCompat('offline');
  ValueNotifierCompat get status => _status;

  void connect({required String url, required String userId, required String token, required String deviceId}) {
    this.url = url;
    this.userId = userId;
    this.token = token;
    this.deviceId = deviceId;
    _manualClose = false;
    _open();
  }

  void _open() {
    if (_manualClose) return;
    _status.value = 'connecting';
    WebSocketChannel ch;
    try {
      ch = WebSocketChannel.connect(Uri.parse(url));
      _ch = ch;
    } catch (e) {
      return _scheduleRetry();
    }
    ch.stream.listen(
      (raw) {
        _status.value = 'online';
        _retry = const Duration(seconds: 2);
        Map<String, dynamic>? obj;
        try {
          obj = jsonDecode(raw as String) as Map<String, dynamic>;
        } catch (_) {
          return;
        }
        final cmd = obj['cmd'] as String?;
        if (cmd == null) return;
        if (cmd == 'open' || cmd == 'connected') {
          _send({'seq': _nextSeq(), 'cmd': 'login', 'data': {'userId': userId, 'token': token, 'platform': 'Windows', 'deviceId': deviceId}});
          _hb?.cancel();
          _hb = Timer.periodic(Duration(milliseconds: heartbeatMs), (_) {
            _send({'seq': _nextSeq(), 'cmd': 'heartbeat', 'data': {}});
          });
          return;
        }
        _events.add(obj);
      },
      onError: (_) => _scheduleRetry(),
      onDone: _scheduleRetry,
    );
  }

  void _scheduleRetry() {
    _hb?.cancel();
    _status.value = 'reconnecting';
    if (_manualClose) return;
    Timer(_retry, _open);
    final next = _retry * 2;
    _retry = next > const Duration(seconds: 30) ? const Duration(seconds: 30) : next;
  }

  int _nextSeq() => ++_seq;

  void _send(Map<String, dynamic> obj) {
    try {
      _ch?.sink.add(jsonEncode(obj));
    } catch (_) {}
  }

  void close() {
    _manualClose = true;
    _hb?.cancel();
    _ch?.sink.close();
    _status.value = 'offline';
  }
}

/// 极简值通知器（不引状态管理框架）
class ValueNotifierCompat {
  ValueNotifierCompat(this._v);
  String _v;
  String get value => _v;
  set value(String v) {
    _v = v;
    for (final fn in List.of(_listeners)) {
      fn(v);
    }
  }

  final _listeners = <void Function(String)>[];
  void addListener(void Function(String) fn) => _listeners.add(fn);
  void removeListener(void Function(String) fn) => _listeners.remove(fn);
}
