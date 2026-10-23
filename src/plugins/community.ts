/**
 * community 插件 —— 板块（云湖的「文章分区」/v1/community/ba/*）
 *
 *   ctx.community.load(typ)         typ 1关注 2热门 3我的 4全部
 *   ctx.community.mine()            我的板块（个人资料页也会用）
 *   ctx.community.create(name, av)  创建板块
 *   ctx.community.edit(id, patch)   改名称/头像
 *   ctx.community.manage(id, vis, pub)  可见范围 / 发帖权限
 *   ctx.community.loadGroups(ba)    看这个板块绑定了哪些群
 *   ctx.community.bindGroup(id, gid) 把群绑到板块
 *
 * 注册控制台页面「板块」。
 */
import Schema from 'schemastery'
import { reactive } from 'vue'
import type { Context } from '../core/context'
import CommunityPage from '../console/pages/CommunityPage.vue'

export const name = 'community'

export interface CommunityCfg {
  pageSize: number
  autoLoadMine: boolean
}

export const communityConfig: Schema<CommunityCfg> = Schema.object({
  pageSize: Schema.number().default(20).description('板块文章每页条数'),
  autoLoadMine: Schema.boolean().default(true).description('启动时自动加载我的板块'),
})

export const communityPlugin = {
  Config: communityConfig,
  name: 'community',
  inject: ['api', 'ui', 'console'],
  provide: ['community'],

  apply(ctx: Context) {
    const api: any = ctx.api
    const ui: any = ctx.ui

    const state = reactive({
      list: [] as any[],
      mine: [] as any[],
      myIds: [] as number[],
      followIds: [] as number[],
      loading: false,
      groups: [] as any[],
      groupsOf: null as any,
      bindGroupId: '',
      viewing: null as any,       // 正在浏览的板块
      posts: [] as any[],
      postPage: 1,         // 该板块的文章
      postDetail: null as any,    // 文章详情
      loadingPosts: false,
      info: null as any,
      newAvatar: '',              // 创建板块时先上传的头像
      editing: null as any,       // 编辑中的板块（带 avatar）
    })

    /** 按类型拉列表；顺手缓存「我的板块」 */
    async function load(typ = 4) {
      state.loading = true
      try {
        const list = await api.baList(typ, { size: 30, page: 1 })
        state.list = list
        if (typ === 3) {
          state.mine = list
          state.myIds = list.map((b: any) => b.id)
        }
      } catch (e: any) {
        ui.toast('板块列表加载失败：' + e.message, 'error')
      } finally { state.loading = false }
    }

    async function mine() {
      try {
        const list = await api.baList(3, { size: 30, page: 1 })
        state.mine = list
        state.myIds = list.map((b: any) => b.id)
        return list
      } catch { return [] }
    }

    function countOf(typ: number) { return typ === 3 ? state.myIds.length : '' }

    async function create(name: string, avatar = '') {
      try {
        const id = await api.baCreate(name, avatar)
        ui.toast(id ? `板块已创建（ID ${id}）` : '板块已创建', 'success')
        await mine()
        await load(3)
      } catch (e: any) { ui.toast('创建失败：' + e.message, 'error') }
    }

    async function edit(baId: number, patch: any) {
      try {
        await api.baEdit(baId, patch)
        ui.toast('已保存', 'success')
        await load(3)
      } catch (e: any) { ui.toast('保存失败：' + e.message, 'error') }
    }

    /** visibleRange 0-公开 1-仅自己；publishAuthority 0/1/2 */
    async function manage(baId: number, visibleRange = 0, publishAuthority = 0) {
      try {
        await api.baManage(baId, visibleRange, publishAuthority)
        ui.toast('权限已更新', 'success')
      } catch (e: any) { ui.toast('更新失败：' + e.message, 'error') }
    }

    async function loadGroups(ba: any) {
      state.groupsOf = ba
      state.groups = []
      try { state.groups = await api.baGroups(ba.id, { size: 30, page: 1 }) }
      catch (e: any) { ui.toast('群聊列表加载失败：' + e.message, 'error') }
    }

    async function bindGroup(baId: number, groupId: string) {
      if (!groupId) return ui.toast('要填群 ID', 'warn')
      try {
        await api.bindBaGroup ? await api.bindBaGroup(baId, groupId) : null
        ui.toast('已提交绑定', 'success')
        await loadGroups(state.groupsOf)
      } catch (e: any) { ui.toast('绑定失败：' + e.message, 'error') }
    }

    /* ---------------- 进入板块：文章列表 / 详情 ---------------- */

    async function enter(ba: any) {
      state.viewing = ba
      state.posts = []
      state.postDetail = null
      state.postPage = 1
      state.loadingPosts = true
      try {
        state.info = await api.baInfo(ba.id).catch(() => null)
        state.posts = await api.baPosts(ba.id, { size: 30, page: 1 })
      } catch (e: any) {
        ui.toast('文章加载失败：' + e.message, 'error')
      } finally { state.loadingPosts = false }
    }
    function exitBoard() { state.viewing = null; state.posts = []; state.postDetail = null }

    async function openPost(p: any) {
      try {
        const d = await api.baPostDetail(p.id)
        // 详情可能嵌套在 post 里；都没有则回退列表项自带 content
        const detail = d?.post ? { ...d, content: d.post.content ?? d.content, title: d.post.title ?? d.title } : d
        state.postDetail = detail?.content || detail?.title ? detail : (p.content || p.title ? p : detail)
      } catch (e: any) {
        // 详情接口失败时回退列表项内容，不让用户看空弹窗
        if (p.content || p.title) { state.postDetail = p; ui.toast('详情接口失败，显示列表缓存内容', 'warn') }
        else ui.toast('文章打不开：' + e.message, 'error')
      }
    }

    /** 板块文章分页加载更多 */
    async function loadMorePosts() {
      const ba = state.viewing
      if (!ba || state.loadingPosts) return
      state.postPage = (state.postPage || 1) + 1
      state.loadingPosts = true
      try {
        const more = await api.baPosts(ba.id, { size: 30, page: state.postPage })
        const ids = new Set(state.posts.map((x: any) => x.id))
        state.posts = [...state.posts, ...more.filter((x: any) => !ids.has(x.id))]
      } catch (e: any) { ui.toast('加载更多失败：' + e.message, 'error') }
      finally { state.loadingPosts = false }
    }

    /** 上传板块头像：选图 → 上传 → 回填 URL（比手输 URL 友好） */
    async function uploadAvatar(ev: any, target: 'new' | 'edit') {
      const f = ev?.target?.files?.[0]
      if (!f) return
      try {
        const res: any = await api.uploadFile(f, 'image')
        const key = typeof res === 'string' ? res : res?.key
        const url = (res?.url) || `https://chat-img.jwznb.com/${key}`
        if (target === 'new') state.newAvatar = url
        else if (state.editing) state.editing.avatar = url
        ui.toast('头像已上传', 'success')
      } catch (e: any) { ui.toast('上传失败：' + e.message, 'error') }
      ev.target.value = ''
    }

    /** 直接创建（带上已上传的头像） */
    async function createWithAvatar(name: string) {
      return create(name, state.newAvatar || '')
    }

    /** 从别处（用户资料）跳过来时：定位到这个板块并直接进入浏览 */
    function focus(ba: any) {
      if (!ba) return
      state.list = state.list.some((b: any) => b.id === ba.id) ? state.list : [ba, ...state.list]
      ctx.setTimeout(() => { enter(ba) }, 300)
    }

    /* ---- 关注（/v1/community/ba/user-follow-ba / unfollow） ---- */
    async function loadFollows() {
      try {
        const list = await api.baList(1, { size: 50, page: 1 })
        state.followIds = list.map((b: any) => b.id)
      } catch { state.followIds = [] }
    }
    function isFollowed(id: number) { return state.followIds.includes(id) }
    async function toggleFollow(b: any) {
      try {
        if (isFollowed(b.id)) { await api.unfollowBoard(b.id); state.followIds = state.followIds.filter((x: number) => x !== b.id); ui.toast('已取消关注', 'success') }
        else { await api.followBoard(b.id); state.followIds = [...state.followIds, b.id]; ui.toast('已关注', 'success') }
      } catch (e: any) { ui.toast('操作失败：' + e.message, 'error') }
    }

    ctx.set('community', { state, load, mine, countOf, create, createWithAvatar, edit, manage, loadGroups, bindGroup, enter, exitBoard, openPost, uploadAvatar, focus, loadFollows, isFollowed, toggleFollow, loadMorePosts })

    // 插件装载时可能还没登录完，接口会失败 → 服务就绪后补拉一次（不然「我的板块」一直是空的）
    ctx.on('auth/ready' as any, () => mine())
    ctx.on('auth/login' as any, () => mine())
    mine()
    ctx.setTimeout(() => { if (!state.mine.length) mine() }, 3000)
    ctx.setTimeout(() => { if (!state.mine.length) mine() }, 8000)

    ctx.logger?.info('community 插件已加载（板块 / 文章分区）')

    ctx.console.addEntry((cc: any) => {
      cc.page({ name: '板块', path: '/community', icon: 'layers', order: 170, component: CommunityPage })
    })
  },
}
