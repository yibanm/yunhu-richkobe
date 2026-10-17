import 'package:flutter/material.dart';

import '../state/app_state.dart';

/// 聊天主区：标题栏 + 消息流（可铺底图）+ 输入区。
class ChatPane extends StatefulWidget {
  const ChatPane({super.key, required this.state});
  final AppState state;

  @override
  State<ChatPane> createState() => _ChatPaneState();
}

class _ChatPaneState extends State<ChatPane> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  bool _sending = false;

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await widget.state.sendText(text);
      _input.clear();
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('发送失败: $e')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final st = widget.state;
    final cur = st.current;
    final scheme = Theme.of(context).colorScheme;
    if (cur == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.chat_bubble_outline, size: 40),
            SizedBox(height: 8),
            Text('从左侧选择一个会话开始聊天'),
          ],
        ),
      );
    }
    final msgs = st.messagesByChat[cur['id']] ?? [];
    return Column(
      children: [
        /* 标题栏 */
        Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: scheme.outlineVariant))),
          child: Row(
            children: [
              Expanded(
                child: Text('${cur['name']}',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
              ),
              Text('${cur['id']}', style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
        /* 消息流（底图） */
        Expanded(
          child: Container(
            decoration: st.wallpaper != null
                ? BoxDecoration(
                    image: DecorationImage(image: NetworkImage(st.wallpaper!), fit: BoxFit.cover))
                : null,
            child: ListView.builder(
              controller: _scroll,
              padding: const EdgeInsets.all(16),
              itemCount: msgs.length,
              itemBuilder: (context, i) {
                final m = msgs[i];
                final mine = m['sender'] == st.me?['id'];
                final content = m['content'] as Map<String, dynamic>? ?? {};
                final text = content['text']?.toString() ?? '';
                final imgUrl = content['image_url']?.toString() ?? '';
                return Align(
                  alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    constraints: const BoxConstraints(maxWidth: 520),
                    decoration: BoxDecoration(
                      color: mine ? scheme.primary : scheme.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (text.isNotEmpty)
                          Text(text,
                              style: TextStyle(
                                  color: mine ? Colors.white : scheme.onSurface, fontSize: 13.5)),
                        if (imgUrl.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Image.network(imgUrl, width: 180, fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) =>
                                    const Text('图片加载失败', style: TextStyle(fontSize: 12))),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ),
        /* 输入区 */
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: scheme.outlineVariant))),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  minLines: 1,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    hintText: '输入消息，Enter 发送',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(onPressed: _sending ? null : _send, child: const Text('发送')),
            ],
          ),
        ),
      ],
    );
  }
}
