/**
 * 内核语义测试：inject 等待/回滚、服务级联卸载、effect 清理
 * 用法： node test-kernel.mjs
 *
 * 适配 cordis 3.x：无 ctx.app.services 枚举；fork.dispose() 为异步；
 * 已注册服务不可直接 ctx.set 覆盖（需先卸载再装载）。
 */
import { createContext, Service } from './src/core/context'

const log = []
const ctx = createContext()

/* A：提供一个服务 */
class Foo extends Service {
  constructor(ctx) { super(ctx, 'foo', true); this.value = 1 }
}

/* B：依赖 foo，记录加载/卸载 */
const pluginB = {
  name: 'B',
  inject: ['foo'],
  apply(ctx) {
    log.push('B loaded, foo=' + ctx.foo.value)
    ctx.effect(() => () => log.push('B disposed'))
  },
}

/* C：不依赖，随便一个插件 */
const pluginC = { name: 'C', apply(ctx) { log.push('C loaded'); ctx.effect(() => () => log.push('C disposed')) } }

const svc = () => (ctx.get('foo') ? 'foo' : '(空)')

const fA = ctx.plugin(Foo)
const fB = ctx.plugin(pluginB)
const fC = ctx.plugin(pluginC)
log.push('services after mount: ' + svc())

/* 卸载 A → foo 消失 → B 应被级联卸载（effect 清理），C 不受影响 */
await fA.dispose()
log.push('services after unmount A: ' + svc())

/* 重新装载 A → B 应自动恢复 */
const fA2 = ctx.plugin(Foo)
log.push('services after remount A: ' + svc())

console.log(log.map((l, i) => `${String(i + 1).padStart(2)}. ${l}`).join('\n'))
console.log('\nC 是否仍然活着：', fC.state)
console.log('B 级联卸载过（日志含 B disposed）：', log.includes('B disposed'))
console.log('B 恢复装载过（日志含两次 B loaded）：', log.filter((l) => l.startsWith('B loaded')).length === 2)
