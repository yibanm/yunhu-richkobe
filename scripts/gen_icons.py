#!/usr/bin/env python3
"""品牌图标生成器 —— 从一张方图生成全平台图标资源。

用法: py scripts/gen_icons.py <源图.jpg|png>
产物:
  build/icon.png (512)            electron-builder 主图标源
  build/icon.ico                  Windows exe / 安装器 / 快捷方式图标
  build/installer-sidebar.bmp     NSIS 安装界面侧栏品牌图 (164x314)
  build/installer-header.bmp      NSIS 安装界面顶栏图 (150x57)
  electron/tray.png               系统托盘图标 (32)
  assets/brand.jpg                README 插图（源图原样拷贝）
  assets/logo.png                 应用内 logo (256)
  android/app/src/main/res/mipmap-*/ic_launcher.png        方形启动图标
  android/app/src/main/res/mipmap-*/ic_launcher_round.png  圆形启动图标
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml 自适应图标
  android/app/src/main/res/drawable/ic_launcher_foreground.png 自适应前景
  android/app/src/main/res/drawable/splash_background.xml  启动页窗口背景
仅依赖 Pillow。颜色取自原仓库色系（--bg #17181f / --acc #5a8cf8）。
"""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (23, 24, 31, 255)          # 原仓库 dark --bg #17181f
ACC = (90, 140, 248, 255)       # 原仓库 dark --acc #5a8cf8

MIPMAPS = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}


def square(img: Image.Image) -> Image.Image:
    """居中裁成正方形。"""
    w, h = img.size
    s = min(w, h)
    return img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def resize(img: Image.Image, size: int) -> Image.Image:
    return square(img.convert('RGBA')).resize((size, size), Image.LANCZOS)


def rounded(img: Image.Image, radius_ratio: float = 0.18, super_sample: int = 4) -> Image.Image:
    """圆角矩形蒙版（超采样抗锯齿）。"""
    s = img.size[0]
    big = s * super_sample
    mask = Image.new('L', (big, big), 0)
    d = ImageDraw.Draw(mask)
    r = int(big * radius_ratio)
    d.rounded_rectangle([0, 0, big - 1, big - 1], radius=r, fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask.resize((s, s), Image.LANCZOS))
    return out


def circle(img: Image.Image, super_sample: int = 4) -> Image.Image:
    s = img.size[0]
    big = s * super_sample
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, big - 1, big - 1], fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask.resize((s, s), Image.LANCZOS))
    return out


def on_bg(img: Image.Image, pad_ratio: float) -> Image.Image:
    """把图缩到 pad 比例后贴到品牌底色上（自适应前景/启动页用）。"""
    s = img.size[0]
    inner = int(s * (1 - 2 * pad_ratio))
    small = resize(img, inner)
    canvas = Image.new('RGBA', (s, s), BG)
    canvas.paste(rounded(small, 0.16), ((s - inner) // 2, (s - inner) // 2), rounded(small, 0.16))
    return canvas


def bmp(path: Path, img: Image.Image) -> None:
    """写 24bit BMP（NSIS 要求）。"""
    img.convert('RGB').save(path, 'BMP')


def main() -> None:
    if len(sys.argv) < 2:
        print('用法: py scripts/gen_icons.py <源图>')
        sys.exit(1)
    src = Image.open(sys.argv[1])
    src.load()

    (ROOT / 'build').mkdir(exist_ok=True)
    (ROOT / 'assets').mkdir(exist_ok=True)
    (ROOT / 'electron').mkdir(exist_ok=True)
    res = ROOT / 'android/app/src/main/res'

    # 主图标 / logo / 托盘
    resize(src, 512).save(ROOT / 'build/icon.png')
    resize(src, 256).save(ROOT / 'assets/logo.png')
    resize(src, 32).save(ROOT / 'electron/tray.png')

    # Windows ico（多尺寸）
    ico = Image.open(ROOT / 'build/icon.png')
    ico.save(ROOT / 'build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

    # NSIS 安装界面品牌图
    side = Image.new('RGB', (164, 314), BG[:3])
    tile = rounded(resize(src, 120), 0.2)
    side.paste(tile, (22, 97), tile)
    bmp(ROOT / 'build/installer-sidebar.bmp', side)
    head = Image.new('RGB', (150, 57), BG[:3])
    ht = resize(src, 41)
    head.paste(ht, (8, 8), ht)
    bmp(ROOT / 'build/installer-header.bmp', head)

    # README 插图（源图原样）
    shutil.copyfile(sys.argv[1], ROOT / 'assets/brand.jpg')

    # Android mipmap
    for name, px in MIPMAPS.items():
        d = res / f'mipmap-{name}'
        d.mkdir(parents=True, exist_ok=True)
        base = resize(src, px)
        rounded(base).save(d / 'ic_launcher.png')
        circle(base).save(d / 'ic_launcher_round.png')

    # 自适应图标（API 26+）：品牌底色 + 安全区内前景
    anydpi = res / 'mipmap-anydpi-v26'
    anydpi.mkdir(parents=True, exist_ok=True)
    (res / 'drawable').mkdir(parents=True, exist_ok=True)
    (res / 'values').mkdir(parents=True, exist_ok=True)
    (anydpi / 'ic_launcher.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background" />\n'
        '    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@drawable/ic_launcher_foreground" />\n'
        '</adaptive-icon>\n', encoding='utf-8')
    on_bg(src, 0.22).save(res / 'drawable/ic_launcher_foreground.png')

    # 启动页窗口背景：品牌底色 + 居中 logo（消除 WebView 加载期黑屏观感）
    (res / 'drawable/splash_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <item android:drawable="@color/ic_launcher_background" />\n'
        '    <item android:gravity="center">\n'
        '        <bitmap android:src="@mipmap/ic_launcher" android:gravity="center" />\n'
        '    </item>\n'
        '</layer-list>\n', encoding='utf-8')

    # 自适应图标底色 / 启动页底色
    (res / 'values/ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '    <color name="ic_launcher_background">#17181F</color>\n</resources>\n', encoding='utf-8')

    print('图标生成完成:')
    for p in sorted(ROOT.glob('build/*')) + sorted(ROOT.glob('assets/*')):
        print(' ', p.relative_to(ROOT))
    print('  android res mipmap x%d' % len(MIPMAPS), '+ adaptive + splash')


if __name__ == '__main__':
    main()
