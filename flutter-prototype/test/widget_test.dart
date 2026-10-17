import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:yunhulaoda/core/pb.dart';

void main() {
  test('protobuf wire 编解码往返一致', () {
    final body = Pb.build([
      Pb.fNum(2, 42),
      Pb.fStr(3, 'hello'),
      Pb.fBytes(5, Uint8List.fromList([1, 2, 3])),
    ]);
    final d = Pb.decode(body);
    expect(Pb.num(d, 2), 42);
    expect(Pb.str(d, 3), 'hello');
  });

  test('废弃 group 字段(wire 3/4)被跳过而不崩溃', () {
    // tag(field=1, wire=3) start group, 内含 varint, tag(field=1, wire=4) end group
    final bytes = Uint8List.fromList([0x0B, 0x08, 0x01, 0x0C, 0x10, 0x02]);
    final d = Pb.decode(bytes);
    expect(Pb.num(d, 2), 2);
  });
}
