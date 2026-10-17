import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'pb.dart';

/// 云湖 v1 接口封装（clean-room）。
/// 信封：请求头 `token`；protobuf 体 Content-Type=application/x-protobuf；
/// JSON 体走 application/json；20s 超时；禁用缓存。
/// 默认基址 https://chat-go.jwzhd.com（可在设置里改）。
class YunhuApi {
  YunhuApi({String? base}) : base = (base ?? defaultBase).replaceAll(RegExp(r'/$'), '');

  static const defaultBase = 'https://chat-go.jwzhd.com';
  static const defaultWsUrl = 'wss://chat-ws-go.jwzhd.com/ws';

  String base;
  String token = '';

  /* ---------- MsgContent 字段表（协议事实） ---------- */
  static const contentField = <String, int>{
    'text': 1, 'buttons': 2, 'image_url': 3, 'file_name': 4, 'file_url': 5,
    'mentioned_id': 6, 'form': 7, 'quote_msg_text': 8, 'image': 9,
    'post_id': 10, 'post_title': 11, 'post_content': 12, 'post_content_type': 13,
    'expression_id': 15, 'quote_image_url': 16, 'quote_image_name': 17,
    'file_size': 18, 'video_url': 19, 'video_time': 20, 'audio_url': 21,
    'audio_time': 22, 'quote_video_url': 23, 'quote_video_time': 24,
    'sticker_item_id': 25, 'sticker_pack_id': 26, 'room_name': 29,
    'call_status_text': 32, 'width': 33, 'height': 34, 'tip': 37,
  };
  static const _numeric = {
    'mentioned_id', 'file_size', 'video_time', 'audio_time', 'quote_video_time',
    'sticker_item_id', 'sticker_pack_id', 'width', 'height', 'post_content_type',
  };

  Uint8List encodeContent(Map<String, dynamic> obj) {
    final parts = <Uint8List>[];
    obj.forEach((k, v) {
      final f = contentField[k];
      if (f == null || v == null || v == '') return;
      if (v is List) {
        for (final it in v) {
          parts.add(Pb.fStr(f, it.toString()));
        }
      } else if (_numeric.contains(k)) {
        parts.add(Pb.fNum(f, int.tryParse(v.toString()) ?? 0));
      } else {
        parts.add(Pb.fStr(f, v.toString()));
      }
    });
    return Pb.build(parts);
  }

  Map<String, dynamic> decodeContent(Uint8List? bytes) {
    final c = (bytes == null || bytes.isEmpty) ? <int, List<dynamic>>{} : Pb.decode(bytes);
    String s(int f) => Pb.str(c, f);
    int n(int f) => Pb.num(c, f);
    return {
      'text': s(1), 'buttons': s(2), 'image_url': s(3), 'file_name': s(4),
      'file_url': s(5), 'form': s(7), 'quote_msg_text': s(8), 'image': s(9),
      'post_id': s(10), 'post_title': s(11), 'post_content': s(12),
      'post_content_type': n(13), 'expression_id': s(15),
      'quote_image_url': s(16), 'file_size': n(18), 'video_url': s(19),
      'audio_url': s(21), 'audio_time': n(22), 'sticker_item_id': n(25),
      'sticker_pack_id': n(26), 'room_name': s(29), 'call_status_text': s(32),
      'width': n(33), 'height': n(34), 'tip': s(37),
    };
  }

  /* ---------- 请求 ---------- */
  Future<YunhuResp> request(String path,
      {String method = 'POST', Object? body, Duration timeout = const Duration(seconds: 20)}) async {
    final headers = <String, String>{'cache-control': 'no-store'};
    if (token.isNotEmpty) headers['token'] = token;
    Uint8List? pbBody;
    if (body is Uint8List) {
      headers['Content-Type'] = 'application/x-protobuf';
      pbBody = body;
    } else if (body != null) {
      headers['Content-Type'] = 'application/json';
    }
    final uri = Uri.parse('$base$path');
    final req = http.Request(method, uri)..headers.addAll(headers);
    if (pbBody != null) {
      req.bodyBytes = pbBody;
    } else if (body != null) {
      req.body = jsonEncode(body);
    }
    final streamed = await req.send().timeout(timeout);
    final bytes = await streamed.stream.toBytes();
    Map<String, dynamic>? json;
    Map<int, List<dynamic>>? pb;
    final ct = streamed.headers['content-type'] ?? '';
    if (ct.contains('json')) {
      try {
        json = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      } catch (_) {}
    } else {
      try {
        pb = Pb.decode(bytes);
      } catch (_) {}
    }
    return YunhuResp(streamed.statusCode, json, pb);
  }

  void assertOk(YunhuResp r) {
    if (r.json != null) {
      // JSON 信封：成功码为 1（云湖约定），msg 为失败原因
      final code = r.json!['code'];
      if (code != 1) {
        throw ApiException(r.json!['msg']?.toString() ?? '请求失败($code)');
      }
      return;
    }
    // protobuf 信封：Status 在字段 1，其 code 在字段 2（1=成功），msg 在字段 3
    final st = Pb.msg(r.pb!, 1);
    final code = Pb.num(st, 2);
    if (code != 0 && code != 1) {
      throw ApiException(Pb.str(st, 3).isEmpty ? '请求失败($code)' : Pb.str(st, 3));
    }
  }

  /* ---------- 账号 ---------- */
  Future<String> login(String email, String password, String deviceId,
      {String platform = 'windows'}) async {
    final r = await request('/v1/user/email-login',
        body: {'email': email, 'password': password, 'deviceId': deviceId, 'platform': platform});
    assertOk(r);
    final t = r.json?['data']?['token'] as String?;
    if (t == null || t.isEmpty) throw ApiException('未返回 token');
    return t;
  }

  Future<Map<String, dynamic>> self() async {
    final r = await request('/v1/user/info', method: 'GET');
    assertOk(r);
    final d = Pb.msg(r.pb!, 2);
    return {
      'id': Pb.str(d, 1),
      'name': Pb.str(d, 2),
      'avatar': Pb.str(d, 3),
      'email': Pb.str(d, 4),
      'coin': Pb.num(d, 8),
      'vip': Pb.num(d, 9),
    };
  }

  /* ---------- 会话 / 消息 ---------- */
  Future<List<Map<String, dynamic>>> conversations() async {
    final r = await request('/v1/conversation/list', body: Uint8List(0));
    assertOk(r);
    final items = Pb.each(r.pb!, 2);
    return items.map((d) {
      final inner = Pb.msg(d, 2);
      return {
        'id': Pb.str(inner, 1),
        'type': Pb.num(inner, 2),
        'name': Pb.str(inner, 3),
        'avatar': Pb.str(inner, 4),
        'unread': Pb.num(inner, 6),
        'preview': Pb.str(inner, 8),
        'ts': Pb.num(inner, 9),
        'at': Pb.num(inner, 12),
      };
    }).toList();
  }

  Future<List<Map<String, dynamic>>> messages(String chatId, int chatType,
      {int count = 30, String? beforeMsgId}) async {
    final parts = [
      Pb.fNum(2, count),
      if (beforeMsgId != null) Pb.fStr(3, beforeMsgId),
      Pb.fNum(4, chatType),
      Pb.fStr(5, chatId),
    ];
    final r = await request('/v1/msg/list-message', body: Pb.build(parts));
    assertOk(r);
    final items = Pb.each(r.pb!, 2);
    return items.map((d) {
      final content = Pb.msg(d, 5);
      return {
        'id': Pb.str(d, 1),
        'sender': Pb.str(d, 2),
        'senderName': Pb.str(d, 3),
        'chatId': Pb.str(d, 4),
        'chatType': Pb.num(d, 6),
        'contentType': Pb.num(d, 7),
        'content': decodeContent(content.isNotEmpty == true ? _firstBytes(content) : null),
        'ts': Pb.num(d, 8),
      };
    }).toList();
  }

  Uint8List? _firstBytes(Map<int, List<dynamic>> d) =>
      d.values.expand((e) => e).whereType<Uint8List>().firstOrNull;

  Future<void> sendMessage({
    required String msgId,
    required String chatId,
    required int chatType,
    required Map<String, dynamic> content,
    required int contentType,
    String? quoteId,
  }) async {
    final parts = [
      Pb.fStr(2, msgId),
      Pb.fStr(3, chatId),
      Pb.fNum(4, chatType),
      Pb.fBytes(5, encodeContent(content)),
      Pb.fNum(6, contentType),
      if (quoteId != null) Pb.fStr(8, quoteId),
    ];
    final r = await request('/v1/msg/send-message', body: Pb.build(parts));
    assertOk(r);
  }

  Future<void> recall(String msgId, String chatId, int chatType) async {
    final r = await request('/v1/msg/recall-msg',
        body: Pb.build([Pb.fStr(2, msgId), Pb.fStr(3, chatId), Pb.fNum(4, chatType)]));
    assertOk(r);
  }

  /* ---------- 群 ---------- */
  Future<Map<String, dynamic>> groupInfo(String groupId) async {
    final r = await request('/v1/group/info', body: Pb.build([Pb.fStr(2, groupId)]));
    assertOk(r);
    final d = Pb.msg(r.pb!, 2);
    return {'name': Pb.str(d, 2), 'notice': Pb.str(d, 4), 'owner': Pb.str(d, 5)};
  }

  Future<List<Map<String, dynamic>>> groupMembers(String groupId) async {
    final r = await request('/v1/group/list-member', body: Pb.build([Pb.fStr(2, groupId)]));
    assertOk(r);
    return Pb.each(r.pb!, 2).map((d) => {
      'id': Pb.str(d, 1), 'name': Pb.str(d, 2), 'role': Pb.num(d, 4),
    }).toList();
  }
}

class YunhuResp {
  YunhuResp(this.status, this.json, this.pb);
  final int status;
  final Map<String, dynamic>? json;
  final Map<int, List<dynamic>>? pb;
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
