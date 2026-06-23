// 3D 场景差异化预设变体：纯 CSS 3D 轻量版 + GSAP 动效编排版。
//
// 约定：本目录（server/presets/variants/）下每个 .js 文件在被 import 时自注册变体
// （见 presetRegistry.loadPresetVariants），新增变体只需新增文件，便于多分支并行、互不冲突。
// 外链策略：仅可引用白名单 CDN 库与素材（见 server/config.js 的 ALLOWED_ASSET_DOMAINS）。

import { registerPresetVariant } from '../../presetRegistry.js';

// ① 纯 CSS 3D / 伪 3D 轻量版（无 WebGL）：低端设备秒开、优雅性能
registerPresetVariant({
  id: 'interactive_3d__css3d_lite',
  sceneType: 'interactive_3d',
  name: '纯 CSS 3D 轻量版（无 WebGL）',
  skillSource: 'css3d',
  techStack: [
    '纯 CSS 3D（transform / perspective / transform-style: preserve-3d）',
    'CSS @keyframes 与 transition 动画',
    '白名单外链图标/纹理（cdn.simpleicons.org、api.iconify.design、images.unsplash.com）',
    '无需任何 JS 库即可运行；交互可用极少量内联原生 JS 增强',
  ],
  keywords: [
    'css3d', 'css 3d', '伪3d', '轻量', '低端', '性能', '快速加载',
    '翻转', '卡片', '立方体', '视差', '层叠', '无webgl', 'preserve-3d',
  ],
  promptSection: [
    '输出自包含 HTML 片段，根元素为单个 <div>，样式与脚本一律内联，不依赖外部框架',
    '仅用纯 CSS 实现 3D：父容器设 perspective（建议 800–1400px），3D 容器设 transform-style: preserve-3d，子面通过 rotateX/rotateY/rotateZ 与 translateZ 在空间中排布',
    '不使用 WebGL、canvas 或重型 3D 库，确保低端设备与弱网下也能秒开、流畅运行',
    '构建可交互 3D 主体（如可旋转立方体/卡片翻面/层叠视差画廊），交互优先用 :hover、:checked（隐藏 checkbox/radio 驱动状态）等纯 CSS 手段；如需指针/陀螺仪驱动旋转，可写极少量内联原生 JS，禁止内联危险事件属性与越权脚本',
    '【适用范围】仅适用于卡片翻转/立方体/层叠视差/伪 3D 装置等由平面元素空间编排的效果；真实几何体（地球/星球/天体/球体/真实产品模型）不在此列，遇到这类需求请改用 three.js WebGL 真 3D 变体，禁止用平面图 rotateY 冒充球体',
    '动画只动 transform 与 opacity 以走 GPU 合成层，适度使用 will-change，并用 @media (prefers-reduced-motion: reduce) 降级为静态',
    '纹理/图标/图片仅引用白名单 CDN，加载失败时降级为 CSS 渐变/纯色背景但保持 3D 结构与可交互',
    '3D 主体与空间交互占据首屏主体，减少大段说明文字，文案以短标签/提示为主',
  ].join('；'),
  acceptance: [
    '不加载任何 WebGL/重型 3D 库，仅靠 CSS transform/perspective/preserve-3d 构建 3D',
    '至少一个可旋转或可翻转/视差的 3D 主体',
    '存在 hover 或点击触发的空间交互（可纯 CSS 或极少量内联 JS）',
    '动画仅作用于 transform/opacity，并提供 prefers-reduced-motion 降级',
    '首屏以 3D 场景为主体，无大段说明文字',
  ],
  enabled: true,
  priority: 2,
});

// ② GSAP 驱动的 3D 动效编排版：滚动驱动、视差、入场叙事
registerPresetVariant({
  id: 'interactive_3d__gsap_motion',
  sceneType: 'interactive_3d',
  name: 'GSAP 驱动的 3D 动效编排版',
  skillSource: 'gsap-core',
  techStack: [
    'GSAP 3 核心（gsap.timeline / gsap.to / from）',
    'GSAP ScrollTrigger 插件（滚动驱动、pin、scrub、视差）',
    'CSS 3D（perspective / preserve-3d）作为被编排的 3D 舞台',
    '白名单 CDN 引库：cdn.jsdelivr.net 或 unpkg.com',
  ],
  keywords: [
    'gsap', 'scrolltrigger', '动效', '编排', '叙事', '时间线', 'timeline',
    '滚动驱动', '视差', 'parallax', '入场动画', 'pin', 'scrub', '滚动故事',
  ],
  promptSection: [
    '输出自包含 HTML 片段，根元素为单个 <div>；用 GSAP 编排 3D 入场、视差与滚动驱动的动效叙事',
    'GSAP 通过白名单 CDN 以 <script> 方式引入并推荐固定版本 3.15：核心 https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js，滚动插件 https://cdn.jsdelivr.net/npm/gsap@3.15/dist/ScrollTrigger.min.js（unpkg 同路径亦可）',
    '脚本中先 gsap.registerPlugin(ScrollTrigger) 再编排；用 gsap.timeline() 串联 3D 主体的入场（from translateZ/rotateX + opacity）与分镜，用 ScrollTrigger 的 scrub/pin 把动画进度绑定到滚动',
    '3D 舞台用 CSS perspective 与 transform-style: preserve-3d 搭建，由 GSAP 驱动 transform（rotX/rotY/translateZ/scale），主体可随滚动或指针变化空间姿态',
    '【适用范围】适用于动效编排、滚动叙事、视差与伪 3D 装置；真实几何体（地球/星球/天体/球体/真实产品模型）不在此列，遇到这类需求请改用 three.js WebGL 真 3D 变体，禁止用平面图 rotateY 冒充球体',
    '所有动画仅改 transform 与 opacity 以保持高帧率；用 gsap.matchMedia() 做响应式断点，并在 (prefers-reduced-motion: reduce) 下关闭/简化动效',
    '若 GSAP CDN 加载失败，降级为 CSS transition 的静态/简版动效但保持 3D 结构与可交互，且这种降级应被视为需修复的异常而非常态',
    '禁止内联危险事件属性与越权脚本，外链仅用于库与白名单素材；3D 主体与滚动叙事占据首屏主体，减少大段说明文字',
  ].join('；'),
  acceptance: [
    '通过白名单 CDN（jsdelivr/unpkg）引入 GSAP 3 与 ScrollTrigger 并 registerPlugin',
    '存在 gsap.timeline 编排的 3D 入场或分镜动画',
    '至少一处 ScrollTrigger 滚动驱动（scrub 或 pin）的 3D 视差/姿态变化',
    '动画仅作用于 transform/opacity，并有 prefers-reduced-motion 降级',
    '首屏以 3D 动效叙事为主体，无大段说明文字',
  ],
  enabled: true,
  priority: 2,
});
