import 'dart:convert';
import 'dart:typed_data';

/// 云湖 v1 接口的 protobuf wire 编解码（clean-room 实现，仅客户端所需子集）。
/// 协议事实（wire type / 字段号语义）来自对服务端行为的观察；代码为独立编写。
/// 注意：服务端响应里存在已废弃的 group 类型字段（wire type 3/4），
/// 解码必须**跳过**而非报错，否则整个响应解析崩溃。
class Pb {
  static final _enc = utf8;

  /* ---------- 编码 ---------- */
  static Uint8List varint(int n) {
    var v = BigInt.from(n);
    if (v < BigInt.zero) v += BigInt.one << 64;
    final out = <int>[];
    while (v > BigInt.from(127)) {
      out.add((v & BigInt.from(127)).toInt() | 128);
      v >>= 7;
    }
    out.add(v.toInt());
    return Uint8List.fromList(out);
  }

  static Uint8List tag(int field, int wire) =>
      varint((field << 3) | wire);

  static Uint8List fNum(int field, int value) =>
      _concat([tag(field, 0), varint(value)]);

  static Uint8List fStr(int field, String value) {
    final e = _enc.encode(value);
    return _concat([tag(field, 2), varint(e.length), Uint8List.fromList(e)]);
  }

  static Uint8List fBytes(int field, Uint8List bytes) =>
      _concat([tag(field, 2), varint(bytes.length), bytes]);

  static Uint8List build(List<Uint8List> parts) => _concat(parts);

  static Uint8List _concat(List<Uint8List> parts) {
    var len = 0;
    for (final p in parts) {
      len += p.length;
    }
    final out = Uint8List(len);
    var o = 0;
    for (final p in parts) {
      out.setRange(o, o + p.length, p);
      o += p.length;
    }
    return out;
  }

  /* ---------- 解码 ---------- */
  /// 返回 字段号 → 该字段所有出现值的列表（wire 原始形态）。
  static Map<int, List<dynamic>> decode(Uint8List u8) {
    var i = 0;
    final out = <int, List<dynamic>>{};

    int rv() {
      var s = 0, sh = 0;
      for (;;) {
        final b = u8[i++];
        s |= (b & 127) << sh;
        if ((b & 128) == 0) break;
        sh += 7;
      }
      return s;
    }

    void skip(int w) {
      if (w == 0) { rv(); return; }
      if (w == 2) { final len = rv(); i += len; return; }
      if (w == 5) { i += 4; return; }
      if (w == 1) { i += 8; return; }
      if (w == 3) {
        for (;;) {
          final t2 = rv();
          final w2 = t2 & 7;
          if (w2 == 4) return;
          skip(w2);
        }
      }
    }

    while (i < u8.length) {
      final t = rv();
      final f = t >> 3;
      final w = t & 7;
      dynamic v;
      if (w == 0) {
        v = rv();
      } else if (w == 2) {
        final len = rv();
        v = Uint8List.fromList(u8.sublist(i, i + len));
        i += len;
      } else if (w == 5) {
        v = Uint8List.fromList(u8.sublist(i, i + 4));
        i += 4;
      } else if (w == 1) {
        v = Uint8List.fromList(u8.sublist(i, i + 8));
        i += 8;
      } else {
        skip(w);
        continue;
      }
      (out[f] ??= <dynamic>[]).add(v);
    }
    return out;
  }

  static dynamic raw(Map<int, List<dynamic>> d, int f) =>
      d[f]?.isNotEmpty == true ? d[f]!.first : null;

  static String str(Map<int, List<dynamic>> d, int f) {
    final v = raw(d, f);
    if (v == null) return '';
    if (v is int) return v.toString();
    if (v is Uint8List) {
      try {
        return _enc.decode(v);
      } catch (_) {
        return '';
      }
    }
    return v.toString();
  }

  static int num(Map<int, List<dynamic>> d, int f) {
    final v = raw(d, f);
    return v is int ? v : 0;
  }

  static bool boolean(Map<int, List<dynamic>> d, int f) => raw(d, f) != null;

  static Map<int, List<dynamic>> msg(Map<int, List<dynamic>> d, int f) {
    final v = raw(d, f);
    return v is Uint8List ? decode(v) : {};
  }

  static List<Map<int, List<dynamic>>> each(Map<int, List<dynamic>> d, int f) =>
      (d[f] ?? []).whereType<Uint8List>().map(decode).toList();
}

/// 会话类型
class ChatType {
  static const user = 1;
  static const group = 2;
  static const bot = 3;
}

/// 消息内容类型
class ContentType {
  static const text = 1;
  static const image = 2;
  static const markdown = 3;
  static const file = 4;
  static const form = 5;
  static const sticker = 7;
  static const html = 8;
  static const tip = 9;
  static const audio = 11;
  static const call = 13;
}
