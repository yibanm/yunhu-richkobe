import 'package:flutter/material.dart';

import '../state/app_state.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.state});
  final AppState state;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  String _err = '';

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.state.login(_email.text.trim(), _pass.text);
    } catch (e) {
      if (mounted) setState(() => _err = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Image.asset('assets/brand.jpg', width: 64, height: 64, fit: BoxFit.cover),
                  ),
                  const SizedBox(height: 12),
                  const Text('云湖牢大版', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text('Flutter 重写 · 仅供学习交流',
                      style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant)),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _email,
                    decoration: const InputDecoration(labelText: '邮箱', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _pass,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: '密码', border: OutlineInputBorder()),
                    onSubmitted: (_) => _submit(),
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: 42,
                    child: FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy ? const CircularProgressIndicator(strokeWidth: 2) : const Text('登录'),
                    ),
                  ),
                  if (_err.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_err, style: TextStyle(color: scheme.error, fontSize: 12)),
                  ],
                  const SizedBox(height: 14),
                  Text('接口来自社区公开文档；只使用你自己的账号 token。',
                      style: TextStyle(fontSize: 11, color: scheme.onSurfaceVariant)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
