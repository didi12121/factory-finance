# UI_DESIGN.md — UI 设计规范引用

> 唯一权威：`docs/DESIGN_SYSTEM.md` + `docs/UI_GUIDELINES.md`（本文件仅索引角色级要点）。

- 设计参考唯一：Stripe Dashboard（公开资料）；定位 Professional Financial Operations Software。
- Token：颜色/排版/布局以 `frontend/src/styles/tokens.css` 为准（含语义 foreground Token，文字对比度 ≥ WCAG AA 4.5:1）。
- 金额：千分位 + 两位小数 + tabular-nums；表格右对齐；指标区标签/金额统一左基线；核心财务数字 28–32px/600。
- 布局：Sidebar 224/56、Header 56、表格行 44、控件 36、圆角 6/8；桌面优先；移动端抽屉导航。
- 禁止清单（AI 风格）：装饰性渐变、玻璃拟态、霓虹、大面积阴影/插画、营销横幅、超大标题、卡片堆砌、Emoji 图标、无意义动画与图表、胶囊按钮滥用、重复状态标签。
- 文案：简洁业务中文；状态文字+语义色（禁纯色区分）；未实现功能明确标注，不放假交互。
- 截图纪律：真实浏览器、同一最终集成版本、业务状态经真实操作生成；禁止生成式图片/效果图/旧提交截图；视觉回归基线待人工审核后固化。
