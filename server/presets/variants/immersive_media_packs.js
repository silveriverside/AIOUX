// 沉浸多媒体场景的差异化预设包：电影化分镜滚动叙事 / 单屏强视觉首屏视差。
//
// 约定：本目录下每个 .js 文件在被 import 时自注册一个或多个变体
// （见 presetRegistry.loadPresetVariants）。新增变体只需新增文件，便于多分支并行、互不冲突。
// 外链策略：仅可引用白名单 CDN 库与素材（见 server/config.js 的 ALLOWED_ASSET_DOMAINS）。

import { registerPresetVariant } from '../../presetRegistry.js';

// ① 电影化分镜滚动叙事：GSAP ScrollTrigger pin/scrub 驱动的镜头感叙事
registerPresetVariant({
  id: 'immersive_media__cinematic_scroll',
  sceneType: 'immersive_media',
  name: '电影化分镜滚动叙事',
  skillSource: 'gsap-scrolltrigger',
  techStack: [
    'GSAP core + ScrollTrigger（from https://cdn.jsdelivr.net/npm/gsap@3.15/dist/）',
    '全屏分镜 section + pin 固定 + scrub 滚动绑定',
    '主视觉图：copilot-cn.bytedance.net text_to_image 或白名单图床，暗调氛围',
    '内联 <style>：CSS 变量暗调主色，渐变/光晕/暗角',
  ],
  keywords: [
    '电影', '分镜', '叙事', '故事', '镜头', '纪录片', '大片', '史诗',
    'cinematic', 'scroll', '滚动', '篇章', '序章', '氛围', '沉浸',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>，不依赖外部 DOM',
    '构建电影化分镜滚动叙事：由多个全屏（100vh 量级）分镜 section 串联，每个 section 一帧大画面 + 极少量旁白文字，随滚动推进像电影分镜逐帧展开',
    '用 GSAP + ScrollTrigger 做滚动驱动：通过 https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js 与 ScrollTrigger.min.js 引入，先 gsap.registerPlugin(ScrollTrigger)，用 pin 固定关键分镜、scrub 把主视觉的位移/缩放/透明度/光晕绑定到滚动进度，营造镜头推拉与转场',
    '因片段常嵌入受限容器，须将 ScrollTrigger 的 scroller 指向片段内部可滚动容器（而非默认 window），并在内容就绪后调用 ScrollTrigger.refresh()',
    '整体暗调氛围：在 :root 定义暗色主色与强调色 CSS 变量，配合渐变、光晕、暗角强化电影质感；主视觉图优先用 https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=<英文提示>&image_size=landscape_16_9 生成或引用白名单图床',
    '首屏视觉面积至少 75%，文字不超过 15%，仅作短标题/旁白/镜头标注；提供至少一个 data-explorable 热点',
    'GSAP 加载失败时降级为 IntersectionObserver 触发的 CSS 过渡，但分镜结构与滚动叙事必须保留，且该降级须标记为待修复异常而非常态',
    '必须包含 @media (prefers-reduced-motion: reduce) 降级：弱化或关闭视差与转场动画',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '多个全屏分镜 section 构成滚动叙事',
    'GSAP ScrollTrigger 的 pin/scrub 驱动镜头转场（或降级 IntersectionObserver）',
    '首屏视觉面积≥75%、文字≤15%，含至少一个可探索热点',
    '暗调氛围 + 包含 prefers-reduced-motion 降级',
  ],
  enabled: true,
  priority: 3,
});

// ② 单屏强视觉首屏视差：单屏 hero 视差大片，鼠标/陀螺仪联动
registerPresetVariant({
  id: 'immersive_media__hero_parallax',
  sceneType: 'immersive_media',
  name: '单屏强视觉首屏视差',
  skillSource: 'frontend-design',
  techStack: [
    '单屏 hero 多层视差（前景/主体/背景分层 + transform 联动）',
    '鼠标 mousemove / 设备方向 deviceorientation 驱动视差',
    '主视觉图：copilot-cn.bytedance.net text_to_image 或白名单图床',
    '内联 <style>：CSS 变量主色，will-change/transform 分层',
  ],
  keywords: [
    '首屏', 'hero', '视差', 'parallax', '海报', '封面', '单屏', '大图',
    '第一视角', '回望', '震撼', '视觉冲击', '主视觉', '氛围',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>，不依赖外部 DOM',
    '构建单屏（约 100vh）强视觉首屏：一张震撼主视觉铺满屏幕，分前景/主体/背景多层，少量标题文字叠加其上',
    '实现视差联动：监听 mousemove（桌面）与 deviceorientation（移动端陀螺仪），按不同层级以不同系数做 transform 位移，营造空间纵深；用 transform/translate3d 并配合 will-change，禁止改变会触发重排的属性',
    '在 :root 定义主色与强调色 CSS 变量，整体配色统一有氛围；主视觉图优先用 https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=<英文提示>&image_size=landscape_16_9 生成或引用白名单图床（images.unsplash.com / images.pexels.com / cdn.pixabay.com）',
    '首屏视觉面积至少 75%，文字不超过 15%，仅作短主标题/副标题/镜头标注；提供至少一个 data-explorable 热点可钻取',
    '必须包含 @media (prefers-reduced-motion: reduce) 降级：关闭视差跟随，回退为静态构图',
    '避免退化成图文卡片页：满屏主视觉与多层视差是绝对主体，文字克制叠加',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '单屏满屏主视觉 + 多层分层结构',
    '鼠标或陀螺仪驱动的多层视差联动（仅用 transform）',
    '首屏视觉面积≥75%、文字≤15%，含至少一个可探索热点',
    '包含 prefers-reduced-motion 降级为静态构图',
  ],
  enabled: true,
  priority: 3,
});
