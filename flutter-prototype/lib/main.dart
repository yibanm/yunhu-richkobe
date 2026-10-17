import 'package:flutter/material.dart';

import 'state/app_state.dart';
import 'ui/login_page.dart';
import 'ui/home_page.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const YunhuLaodaApp());
}

class YunhuLaodaApp extends StatefulWidget {
  const YunhuLaodaApp({super.key});

  @override
  State<YunhuLaodaApp> createState() => _YunhuLaodaAppState();
}

class _YunhuLaodaAppState extends State<YunhuLaodaApp> {
  final state = AppState();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    state.init().then((_) {
      state.addListener(_onState);
      if (mounted) setState(() => _ready = true);
    });
  }

  void _onState() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final dark = state.themeMode != ThemeMode.light;
    final scheme = ColorScheme.fromSeed(
      seedColor: state.accent,
      brightness: dark ? Brightness.dark : Brightness.light,
    );
    return MaterialApp(
      title: '云湖牢大版',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: scheme,
        useMaterial3: true,
        scaffoldBackgroundColor: dark ? const Color(0xFF17181F) : const Color(0xFFF4F6F9),
        cardTheme: CardThemeData(
          color: dark ? const Color(0xFF1E202A) : Colors.white,
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      home: !_ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : (state.token == null ? LoginPage(state: state) : HomePage(state: state)),
    );
  }
}
