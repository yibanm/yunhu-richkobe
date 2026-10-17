import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';
import '../core/ws.dart';

/// 全局应用状态（极简 ChangeNotifier，不引状态管理框架）。
class AppState extends ChangeNotifier {
  final api = YunhuApi();
  final ws = YunhuWs();

  String? token;
  Map<String, dynamic>? me;
  List<Map<String, dynamic>> conversations = [];
  Map<String, List<Map<String, dynamic>>> messagesByChat = {};
  Map<String, dynamic>? current;

  /* 主题：强调色 + 聊天底图（QQ 调色盘同款能力） */
  Color accent = const Color(0xFF5A8CF8);
  String? wallpaper;
  ThemeMode themeMode = ThemeMode.dark;

  String get deviceId => _deviceId;
  String _deviceId = 'yunhulaoda-desktop';

  final List<String> bootLog = [];

  Future<void> init() async {
    final sp = await SharedPreferences.getInstance();
    token = sp.getString('token');
    accent = Color(sp.getInt('accent') ?? 0xFF5A8CF8);
    wallpaper = sp.getString('wallpaper');
    themeMode = (sp.getString('themeMode') ?? 'dark') == 'light' ? ThemeMode.light : ThemeMode.dark;
    api.base = sp.getString('apiBase') ?? YunhuApi.defaultBase;
    _deviceId = sp.getString('deviceId') ?? _deviceId;
    if (token != null) {
      api.token = token!;
      await restore();
    }
  }

  Future<void> login(String email, String password) async {
    final t = await api.login(email, password, _deviceId);
    token = t;
    api.token = t;
    final sp = await SharedPreferences.getInstance();
    await sp.setString('token', t);
    await restore();
  }

  Future<void> restore() async {
    try {
      me = await api.self();
      await refreshConversations();
      _connectWs();
    } catch (e) {
      bootLog.add('restore 失败: $e');
    }
    notifyListeners();
  }

  void _connectWs() {
    final id = me?['id']?.toString() ?? '';
    if (id.isEmpty || token == null) return;
    ws.events.listen(_onWsEvent);
    ws.connect(url: YunhuApi.defaultWsUrl, userId: id, token: token!, deviceId: _deviceId);
  }

  void _onWsEvent(Map<String, dynamic> obj) {
    final cmd = obj['cmd'] as String?;
    if (cmd == 'push_message') {
      // 新消息：刷新对应会话（首版直接拉列表，保证正确性优先）
      refreshConversations();
      final chatId = (obj['data']?['chatId'] ?? obj['data']?['channel']?['id'])?.toString();
      if (chatId != null && current?['id'] == chatId) loadMessages(chatId);
    }
    notifyListeners();
  }

  Future<void> refreshConversations() async {
    try {
      conversations = await api.conversations();
    } catch (e) {
      bootLog.add('会话列表失败: $e');
    }
    notifyListeners();
  }

  Future<void> openChat(Map<String, dynamic> conv) async {
    current = conv;
    notifyListeners();
    await loadMessages(conv['id'] as String);
  }

  Future<void> loadMessages(String chatId) async {
    final conv = current;
    if (conv == null) return;
    try {
      final msgs = await api.messages(chatId, conv['type'] as int? ?? 1);
      messagesByChat[chatId] = msgs.reversed.toList();
    } catch (e) {
      bootLog.add('消息加载失败: $e');
    }
    notifyListeners();
  }

  Future<void> sendText(String text) async {
    final conv = current;
    if (conv == null || text.trim().isEmpty) return;
    final msgId = DateTime.now().microsecondsSinceEpoch.toString();
    await api.sendMessage(
      msgId: msgId,
      chatId: conv['id'] as String,
      chatType: conv['type'] as int? ?? 1,
      content: {'text': text},
      contentType: 1,
    );
    await loadMessages(conv['id'] as String);
  }

  /* ---------- 主题 ---------- */
  Future<void> setAccent(Color c) async {
    accent = c;
    final sp = await SharedPreferences.getInstance();
    await sp.setInt('accent', c.toARGB32());
    notifyListeners();
  }

  Future<void> setWallpaper(String? url) async {
    wallpaper = url;
    final sp = await SharedPreferences.getInstance();
    if (url == null) {
      await sp.remove('wallpaper');
    } else {
      await sp.setString('wallpaper', url);
    }
    notifyListeners();
  }

  Future<void> setThemeMode(ThemeMode m) async {
    themeMode = m;
    final sp = await SharedPreferences.getInstance();
    await sp.setString('themeMode', m == ThemeMode.light ? 'light' : 'dark');
    notifyListeners();
  }

  Future<void> logout() async {
    ws.close();
    token = null;
    me = null;
    conversations = [];
    messagesByChat = {};
    current = null;
    final sp = await SharedPreferences.getInstance();
    await sp.remove('token');
    notifyListeners();
  }
}
