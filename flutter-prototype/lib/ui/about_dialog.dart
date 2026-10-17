import 'package:flutter/material.dart';

/// 关于页：鸣谢上游作者 + 本项目作者 + 许可说明。
void showYunhuAbout(BuildContext context) {
  showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Row(
        children: [
          Icon(Icons.favorite_outline, size: 20),
          SizedBox(width: 8),
          Text('关于 云湖牢大版', style: TextStyle(fontSize: 16)),
        ],
      ),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 420),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.asset('assets/brand.jpg', width: 56, height: 56, fit: BoxFit.cover),
              ),
              const SizedBox(height: 10),
              const Text('云湖牢大版 v1.0.0（Flutter 重写版）',
                  style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              const Text('本项目作者', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const Text('yibanm（GitHub: yibanm）—— 产品、Flutter 客户端、发布与运维。',
                  style: TextStyle(fontSize: 12.5)),
              const SizedBox(height: 8),
              const Text('鸣谢', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const Text(
                '功能与协议设计参考自 FLY1919 的开源项目 yunhu-vue'
                '（github.com/FLY1919/yunhu-vue）。本项目为独立重写（clean-room）：'
                '未复制其源码，仅参考其功能划分与对云湖接口行为的公开整理。'
                '感谢原作者对社区的贡献。',
                style: TextStyle(fontSize: 12.5),
              ),
              const SizedBox(height: 8),
              const Text('许可与声明', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              const Text(
                '上游 yunhu-vue 未附带开源许可证，README 声明「仅供学习交流」；'
                '因此本项目不复制其代码，亦不就上游代码主张任何权利。'
                '云湖接口为第三方私有服务，使用须遵守云湖用户协议；'
                '本客户端仅供学习交流，请勿用于商业用途或违反服务条款的场景。',
                style: TextStyle(fontSize: 12.5),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('关闭')),
      ],
    ),
  );
}
