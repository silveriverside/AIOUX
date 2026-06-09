// 卡片浏览场景的差异化预设包：杂志策展式网格 / 瀑布流画廊图集。
//
// 约定：本目录下每个 .js 文件在被 import 时自注册一个或多个变体
// （见 presetRegistry.loadPresetVariants）。新增变体只需新增文件，便于多分支并行、互不冲突。
// 外链策略：仅可引用白名单 CDN 库与素材（见 server/config.js 的 ALLOWED_ASSET_DOMAINS）。

import { registerPresetVariant } from '../../presetRegistry.js';

// ① 杂志策展式网格：非对称 CSS Grid + 特色字体排版，编辑感强
registerPresetVariant({
  id: 'card_browser__editorial_grid',
  sceneType: 'card_browser',
  name: '杂志策展式网格',
  skillSource: 'frontend-design',
  techStack: [
    '非对称 CSS Grid（grid-template-areas / span 跨列跨行）',
    '特色字体 from https://cdn.jsdelivr.net/npm/@fontsource/*（避免 Inter/Arial 等系统默认字体）',
    '封面图优先 copilot-cn.bytedance.net text_to_image，可叠加白名单外链图床',
    '内联 <style>：:root CSS 变量定义主色 + 强调色，hover 仅动 transform/opacity',
  ],
  keywords: [
    '攻略', '合集', '策展', '杂志', '专题', '排版', '精选', '专栏',
    'editorial', 'grid', '网格', '画报', '指南', '榜单',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>，不依赖外部 DOM',
    '用非对称 CSS Grid 构建杂志策展式版面：不同卡片跨不同列宽/行高（如首图大卡 + 若干中小卡），形成有节奏的编辑感而非千篇一律等宽网格',
    '在 :root 定义 CSS 变量主色与强调色，整页配色统一克制；标题使用从 https://cdn.jsdelivr.net/npm/@fontsource/ 引入的特色字体（如 fraunces / playfair-display 衬线或其它有性格的字体），避免 Inter/Arial/system-ui 等默认字体',
    '每张卡片含封面图 + 短标题 + 精炼摘要 + 可选标签；封面图优先用 https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=<英文提示>&image_size=landscape_4_3 生成，或引用白名单图床（images.unsplash.com / images.pexels.com / cdn.pixabay.com）',
    '至少 6 张可点击卡片（data-explorable="1" 且带 data-label），hover 时仅改变 transform（轻微缩放/上浮）与 opacity/阴影，禁止触发布局重排',
    '必须包含 @media (prefers-reduced-motion: reduce) 降级：关闭或弱化 hover 动效与过渡',
    '避免退化成等宽信息流卡片：版式的非对称编排与字体排版是视觉主体，文字精炼不堆砌长段落',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '使用非对称 CSS Grid（存在跨列/跨行的不等尺寸卡片）',
    ':root 定义主色 + 强调色 CSS 变量，标题使用 @fontsource 特色字体',
    '至少 6 张可点击卡片，hover 仅动 transform/opacity',
    '包含 prefers-reduced-motion 降级',
  ],
  enabled: true,
  priority: 2,
});

// ② 瀑布流画廊图集：multi-column / masonry 布局，强调图片浏览
registerPresetVariant({
  id: 'card_browser__masonry_gallery',
  sceneType: 'card_browser',
  name: '瀑布流画廊图集',
  skillSource: 'frontend-design',
  techStack: [
    '瀑布流布局（CSS columns 或 grid masonry / dense 排布）',
    '特色字体 from https://cdn.jsdelivr.net/npm/@fontsource/*',
    '图片来源：copilot-cn.bytedance.net text_to_image 或白名单图床（不同长宽比混排）',
    '内联 <style>：lazy hover 遮罩 + 渐显，仅动 transform/opacity',
  ],
  keywords: [
    '图集', '画廊', '瀑布流', '相册', '摄影', '作品集', '图库', '灵感',
    'masonry', 'gallery', '美图', '壁纸', '写真', '图片墙',
  ],
  promptSection: [
    '产出自包含 HTML 片段，根元素为单个 <div>，可内联 <style> 与 <script>，不依赖外部 DOM',
    '构建瀑布流画廊：用 CSS columns（column-count + break-inside: avoid）或 grid masonry 让不同长宽比的图片错落排布，形成图片墙的浏览体感',
    '至少 8 张图片卡片，图片采用不同长宽比（portrait/landscape/square 混排）；图片优先用 https://copilot-cn.bytedance.net/api/ide/v1/text_to_image?prompt=<英文提示>&image_size=<portrait_4_3|square|landscape_4_3> 生成，或引用白名单图床',
    '每张图卡可点击（data-explorable="1" 且带 data-label），hover 时显示渐显遮罩 + 标题/标签，遮罩与缩放仅用 transform 与 opacity，禁止触发布局重排',
    '在 :root 定义中性背景色与强调色 CSS 变量；少量文字（标题/图注）使用从 https://cdn.jsdelivr.net/npm/@fontsource/ 引入的特色字体，避免默认系统字体',
    '必须包含 @media (prefers-reduced-motion: reduce) 降级：关闭或弱化遮罩动效与过渡',
    '避免退化成等宽卡片网格：错落的瀑布流图片墙是视觉主体，图片占据绝大部分面积，文字仅作图注',
    '所有脚本内联或来自白名单 CDN，禁止内联危险事件属性与越权脚本',
  ].join('；'),
  acceptance: [
    '使用瀑布流/masonry 错落布局（图片不同长宽比混排）',
    '至少 8 张可点击图片卡片',
    'hover 显示遮罩/图注且仅动 transform/opacity',
    '包含 prefers-reduced-motion 降级',
  ],
  enabled: true,
  priority: 2,
});
