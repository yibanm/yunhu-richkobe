import 'package:flutter/material.dart';

import '../state/app_state.dart';

/// 调色盘（QQ 同款入口）：预设主题色 + 自定义取色 + 自定义聊天底图。
class PalettePop extends StatelessWidget {
  const PalettePop({super.key, required this.state, required this.onClose});
  final AppState state;
  final VoidCallback onClose;

  static const _presets = <String, int>{
    '云湖蓝': 0xFF5A8CF8,
    '靛青': 0xFF4C6EF5,
    '紫罗兰': 0xFF7C5CFC,
    '品红': 0xFFD6409F,
    '朱红': 0xFFE8590C,
    '琥珀': 0xFFE0A94A,
    '草绿': 0xFF3EC97E,
    '青碧': 0xFF15AABF,
  };

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      elevation: 8,
      borderRadius: BorderRadius.circular(12),
      color: scheme.surfaceContainerHigh,
      child: Container(
        width: 240,
        padding: const EdgeInsets.all(14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('调色盘', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                const Spacer(),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: onClose,
                ),
              ],
            ),
            const Text('主题色', style: TextStyle(fontSize: 11)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _presets.entries.map((e) {
                final c = Color(e.value);
                final on = state.accent.toARGB32() == c.toARGB32();
                return InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () => state.setAccent(c),
                  child: Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: c,
                      borderRadius: BorderRadius.circular(8),
                      border: on ? Border.all(color: scheme.onSurface, width: 2) : null,
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('自定义', style: TextStyle(fontSize: 12)),
                const SizedBox(width: 8),
                _ColorPick(state: state),
              ],
            ),
            const SizedBox(height: 10),
            const Text('聊天底图', style: TextStyle(fontSize: 11)),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _pickWallpaper(context),
                    child: const Text('输入图片 URL'),
                  ),
                ),
                const SizedBox(width: 6),
                OutlinedButton(
                  onPressed: state.wallpaper == null ? null : () => state.setWallpaper(null),
                  child: const Text('清除'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickWallpaper(BuildContext context) async {
    final ctrl = TextEditingController(text: state.wallpaper ?? '');
    final url = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('聊天底图 URL'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(hintText: 'https://…')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('应用')),
        ],
      ),
    );
    if (url != null && url.isNotEmpty) await state.setWallpaper(url);
  }
}

class _ColorPick extends StatefulWidget {
  const _ColorPick({required this.state});
  final AppState state;

  @override
  State<_ColorPick> createState() => _ColorPickState();
}

class _ColorPickState extends State<_ColorPick> {
  Future<void> _pick() async {
    final c = await showDialog<Color>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('自定义主题色'),
        content: ColorPickerDialog(initial: widget.state.accent),
      ),
    );
    if (c != null) await widget.state.setAccent(c);
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: _pick,
      child: Container(
        width: 34,
        height: 22,
        decoration: BoxDecoration(
          color: widget.state.accent,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.white24),
        ),
      ),
    );
  }
}

/// 简易取色器：HSL 三滑杆。
class ColorPickerDialog extends StatefulWidget {
  const ColorPickerDialog({super.key, required this.initial});
  final Color initial;

  @override
  State<ColorPickerDialog> createState() => _ColorPickerDialogState();
}

class _ColorPickerDialogState extends State<ColorPickerDialog> {
  late double _h, _s, _l;

  @override
  void initState() {
    super.initState();
    final hsl = HSLColor.fromColor(widget.initial);
    _h = hsl.hue / 360;
    _s = hsl.saturation;
    _l = hsl.lightness;
  }

  Color get _color => HSLColor.fromAHSL(1, _h * 360, _s, _l).toColor();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(height: 40, color: _color),
        Slider(value: _h, onChanged: (v) => setState(() => _h = v), label: '色相'),
        Slider(value: _s, onChanged: (v) => setState(() => _s = v), label: '饱和'),
        Slider(value: _l, onChanged: (v) => setState(() => _l = v), label: '明度'),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('取消')),
            FilledButton(onPressed: () => Navigator.pop(context, _color), child: const Text('确定')),
          ],
        ),
      ],
    );
  }
}
