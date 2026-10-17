import 'package:flutter/material.dart';

import '../state/app_state.dart';
import 'chat_pane.dart';
import 'palette_pop.dart';
import 'about_dialog.dart';

/// QQ 式三栏布局：左功能栏 / 中会话列表 / 右聊天主区。
/// 层级对应 QQ：消息、通讯录（会话/群/机器人）、设置、调色盘、关于。
class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.state});
  final AppState state;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _rail = 0; // 0 消息 / 1 通讯录 / 2 设置
  final _search = TextEditingController();
  bool _paletteOpen = false;

  List<Map<String, dynamic>> get _filtered {
    final q = _search.text.trim();
    if (q.isEmpty) return widget.state.conversations;
    return widget.state.conversations
        .where((c) => (c['name'] ?? '').toString().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final st = widget.state;
    return Scaffold(
      body: Row(
        children: [
          /* ---- 左功能栏（QQ 竖条） ---- */
          NavigationRail(
            selectedIndex: _rail,
            onDestinationSelected: (i) => setState(() => _rail = i),
            labelType: NavigationRailLabelType.none,
            leading: Column(
              children: [
                const SizedBox(height: 8),
                CircleAvatar(
                  radius: 18,
                  backgroundImage: (st.me?['avatar'] as String? ?? '').isNotEmpty
                      ? NetworkImage(st.me!['avatar'] as String)
                      : null,
                  child: (st.me?['avatar'] as String? ?? '').isEmpty
                      ? const Icon(Icons.person, size: 20)
                      : null,
                ),
              ],
            ),
            trailing: Expanded(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: '调色盘（主题色 / 底图）',
                      icon: const Icon(Icons.palette_outlined),
                      color: _paletteOpen ? scheme.primary : null,
                      onPressed: () => setState(() => _paletteOpen = !_paletteOpen),
                    ),
                    IconButton(
                      tooltip: '关于',
                      icon: const Icon(Icons.info_outline),
                      onPressed: () => showYunhuAbout(context),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
            ),
            destinations: const [
              NavigationRailDestination(icon: Icon(Icons.chat_bubble_outline), label: Text('消息')),
              NavigationRailDestination(icon: Icon(Icons.contacts_outlined), label: Text('通讯录')),
              NavigationRailDestination(icon: Icon(Icons.settings_outlined), label: Text('设置')),
            ],
          ),
          const VerticalDivider(width: 1),
          /* ---- 中：会话列表 ---- */
          SizedBox(
            width: 280,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(10),
                  child: TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      hintText: '搜索',
                      prefixIcon: const Icon(Icons.search, size: 18),
                      isDense: true,
                      filled: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
                Expanded(
                  child: _rail == 0
                      ? _ConvList(state: st, filtered: _filtered)
                      : _rail == 1
                          ? const Center(child: Text('通讯录（群 / 机器人）\n后续版本接入', textAlign: TextAlign.center))
                          : _SettingsPane(state: st),
                ),
              ],
            ),
          ),
          const VerticalDivider(width: 1),
          /* ---- 右：聊天主区 ---- */
          Expanded(
            child: Stack(
              children: [
                ChatPane(state: st),
                if (_paletteOpen)
                  Positioned(
                    left: 8,
                    bottom: 8,
                    child: PalettePop(
                      state: st,
                      onClose: () => setState(() => _paletteOpen = false),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ConvList extends StatelessWidget {
  const _ConvList({required this.state, required this.filtered});
  final AppState state;
  final List<Map<String, dynamic>> filtered;

  @override
  Widget build(BuildContext context) {
    if (filtered.isEmpty) {
      return const Center(child: Text('暂无会话', style: TextStyle(fontSize: 13)));
    }
    return ListView.builder(
      itemCount: filtered.length,
      itemBuilder: (context, i) {
        final c = filtered[i];
        final active = state.current?['id'] == c['id'];
        final unread = (c['unread'] as int? ?? 0);
        return ListTile(
          selected: active,
          selectedTileColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.10),
          leading: CircleAvatar(
            radius: 20,
            backgroundImage: (c['avatar'] as String? ?? '').isNotEmpty
                ? NetworkImage(c['avatar'] as String)
                : null,
            child: (c['avatar'] as String? ?? '').isEmpty ? const Icon(Icons.group) : null,
          ),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  (c['at'] ?? 0) > 0 ? '[有人@我] ${c['name']}' : '${c['name']}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontWeight: unread > 0 ? FontWeight.w600 : FontWeight.w500),
                ),
              ),
              if (unread > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primary,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(unread > 99 ? '99+' : '$unread',
                      style: const TextStyle(color: Colors.white, fontSize: 10)),
                ),
            ],
          ),
          subtitle: Text(c['preview']?.toString() ?? '',
              maxLines: 1, overflow: TextOverflow.ellipsis),
          onTap: () => state.openChat(c),
        );
      },
    );
  }
}

class _SettingsPane extends StatelessWidget {
  const _SettingsPane({required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        const Text('设置', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        SwitchListTile(
          title: const Text('浅色模式'),
          value: state.themeMode == ThemeMode.light,
          onChanged: (v) => state.setThemeMode(v ? ThemeMode.light : ThemeMode.dark),
        ),
        ListTile(
          title: const Text('清除聊天底图'),
          onTap: () => state.setWallpaper(null),
        ),
        ListTile(
          title: const Text('退出登录', style: TextStyle(color: Colors.red)),
          onTap: () => state.logout(),
        ),
      ],
    );
  }
}
