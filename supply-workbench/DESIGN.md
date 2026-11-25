# SHINEMAGE 供应链工作台视觉规范

本文定义采购工作台的页面组件、主题和视觉验收口径。[第 10 节](#10-面向客户的查询与看板整理)给出查询设计。客户查询仍为提案。[第 11 节](#11-内部页面组件与验收)记录现有板块的组件和验收场景。

组件库是 antd 6.6.5，锁在 `apps/web/package.json`。主题 API、Table 分页和 Tag 全部用 v6。`placement` 替代已废弃的 `position`。Tag 用 `variant`。不安装 `@ant-design/pro-components`。该包的 peer 停在 antd 4 和 5，不支持 antd 6。Pro 的做法只作参照。

做法来自三处，按这个顺序取舍。

1. 沿用现有界面的词汇和密度。品牌色用 oklch 或 OKLab 调和，使用设计系统里的确定值。
2. 本文和 `apps/web/src/theme/tokens.ts`。
3. antd 6.6.5 的默认值。覆盖默认值时遵循本文的可用性和对比度要求。

对比度用 WCAG 2.x 相对亮度，公式与 `apps/web/src/theme/contrast.ts` 相同。正文至少 4.5 比 1。输入框边框至少 3 比 1。

## 1. 已经定下的六条

这六条覆盖设计建议稿里标成冲突或未测的点。后文不再给第二套写法。

1. 表格只用 antd `Table`。不引入 TanStack Table。行数超过 200 时打开 antd Table 自带的 `virtual`，并给出 `scroll.y`。每页 50 行的列表不开虚拟滚动。
2. 翻页、筛选、改条件时保留旧数据，用 Table 自带的 `loading={{ spinning: true, delay: 200 }}`。延迟 200 毫秒再转，避免闪一下。不用顶部细进度条。
3. 表格里的日期，同一年写 `MM-DD`，跨年写 `YYYY-MM-DD`。悬停用 Tooltip 显示完整日期和星期。详情、时间线、审计、导入时间和导出用 `YYYY-MM-DD HH:mm`，24 小时制，时区 `Asia/Shanghai`。
4. 抽屉宽度只有 480 和 720。480 给六个字段以内的快捷动作。720 给产品编辑、别名关联、导入冲突和跟进中心预览。不要第三档。
5. 行高以 antd 在本主题下的实际渲染为准，不写 36 或 44。2026-11-03 在本地 Node 24、antd 6.6.5、视口 1440×900 上用 Playwright 量过，结论在第 5 节。
6. 输入框边框用 `#918A99`。不采用 `#D3CDD9`。对比度写在第 2 节。

## 2. 主题 token

下面这组替换 `apps/web/src/theme/antd.ts`。常量从 `tokens.ts` 引。字面量写在这里，方便对照。

```tsx
import { theme, type ThemeConfig } from 'antd';

const brand = { 100: '#E8DCF0', 200: '#D3C3E8', 300: '#C2AED5', 400: '#A088BF', 600: '#805D9D', 800: '#4A2D5E' } as const;
const primaryHover = '#6D4C83';
const textTertiary = '#6E6777';
const controlBorder = '#918A99';

export const antdTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: brand[600],
    colorPrimaryHover: primaryHover,
    colorPrimaryActive: brand[800],
    colorPrimaryBg: brand[100],
    colorPrimaryBgHover: brand[200],
    colorPrimaryBorder: brand[300],
    colorPrimaryBorderHover: brand[400],
    colorLink: brand[600],
    colorLinkHover: primaryHover,
    colorLinkActive: brand[800],
    controlItemBgActive: brand[100],
    colorInfo: '#1849A9',
    colorInfoText: '#1849A9',
    colorInfoBg: '#EFF8FF',
    colorInfoBorder: '#B9CCEA',
    colorSuccess: '#067647',
    colorSuccessText: '#067647',
    colorSuccessBg: '#ECFDF3',
    colorSuccessBorder: '#B2DBC8',
    colorWarning: '#93370D',
    colorWarningText: '#93370D',
    colorWarningBg: '#FFFAEB',
    colorWarningBorder: '#E4C9B4',
    colorError: '#B42318',
    colorErrorText: '#B42318',
    colorErrorBg: '#FEF3F2',
    colorErrorBorder: '#ECBFBC',
    colorText: '#1F1A24',
    colorTextHeading: '#1F1A24',
    colorTextSecondary: '#5C5566',
    colorTextTertiary: textTertiary,
    colorTextDescription: textTertiary,
    colorTextPlaceholder: textTertiary,
    colorIcon: textTertiary,
    colorBorder: controlBorder,
    colorBorderSecondary: '#E6E1EA',
    colorSplit: '#E6E1EA',
    colorBgLayout: '#F7F5F9',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
    fontSize: 14,
    fontSizeSM: 12,
    fontSizeLG: 16,
    fontSizeHeading1: 20,
    fontSizeHeading2: 16,
    fontSizeHeading3: 14,
    fontSizeHeading4: 14,
    fontSizeHeading5: 14,
    lineHeightHeading1: 1.4,
    lineHeightHeading2: 1.5,
    borderRadius: 6,
    borderRadiusSM: 4,
    borderRadiusLG: 8,
    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,
  },
  components: {
    Layout: {
      siderBg: brand[800],
      headerBg: '#FFFFFF',
      headerHeight: 52,
      headerPadding: '0 16px',
      bodyBg: '#F7F5F9',
    },
    Menu: {
      collapsedWidth: 56,
      itemHeight: 40,
      darkItemBg: brand[800],
      darkSubMenuItemBg: brand[800],
      darkPopupBg: brand[800],
      darkItemColor: '#C0B6C7',
      darkItemHoverColor: '#FFFFFF',
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
      darkItemSelectedBg: brand[600],
      darkItemSelectedColor: '#FFFFFF',
    },
    Table: {
      headerBg: '#F7F5F9',
      headerColor: '#5C5566',
      headerSplitColor: 'transparent',
      rowHoverBg: '#F7F5F9',
      rowSelectedBg: brand[200],
      rowSelectedHoverBg: brand[300],
      borderColor: '#E6E1EA',
      cellFontSize: 13,
      cellFontSizeMD: 13,
      cellFontSizeSM: 13,
      cellPaddingBlockSM: 8,
      cellPaddingInlineSM: 8,
      cellPaddingBlockMD: 12,
      cellPaddingInlineMD: 12,
    },
    Statistic: { contentFontSize: 28, titleFontSize: 12 },
    Tag: { defaultBg: '#F2F0F4', defaultColor: '#5C5566' },
    Drawer: { footerPaddingBlock: 12, footerPaddingInline: 24 },
  },
};
```

### 2.1 颜色为什么是这些值

`colorPrimary` 保持 `#805D9D`。白字对比度 5.29。品牌紫只用于主按钮、链接、选中和焦点环。

`colorPrimaryHover` 用 `#6D4C83`。它是 brand.600 朝 brand.800 走 35% 的 OKLab 插值。白字 6.97。antd 从 seed 派生的悬停色和 brand.400 `#A088BF` 白字只有 3.10，都不能放白字。brand.400 只做边框和图形。

`colorInfo` 用 `#1849A9`，也就是 `tokens.ts` 里的 status.info。现在 `antd.ts` 把 `colorInfo` 设成 brand.600，信息提示会变成紫色，和「状态色不用紫」冲突。链接仍显式设成 brand.600，不跟着 colorInfo 走。选中行里的链接用 `#4A2D5E`。

`colorTextTertiary`、说明、占位和图标用 `#6E6777`。现在的 `#8A8494` 在白底是 3.62，在页面底 `#F7F5F9` 是 3.34，都不到 4.5。`contrastPairs` 没包含 tertiary，所以单测没拦住。`#6E6777` 白底 5.43，页面底 5.01，中性底 `#F2F0F4` 上 4.79。不要把 `#6E6777` 放在 brand.100 上，那个组合只有 4.12。brand.600 的字放在 brand.100 上只有 4.01，这个底上的字用 `colorText`。

状态色的文字和底色沿用 `tokens.ts`。必须写进 antd 的 `colorErrorText`、`colorWarningText`、`colorSuccessText`。只设 `colorPrimary` 时，这三色仍是 antd 默认的 `#ff4d4f`、`#faad14`、`#52c41a`。白底对比度分别是 3.27、1.90、2.27。`Typography` 的 danger、表单校验和 Alert 图标都会不达标。

| 语义 | 文字 | 底 | 实心边框 |
| --- | --- | --- | --- |
| error | `#B42318` | `#FEF3F2` | `#ECBFBC` |
| warning | `#93370D` | `#FFFAEB` | `#E4C9B4` |
| info | `#1849A9` | `#EFF8FF` | `#B9CCEA` |
| success | `#067647` | `#ECFDF3` | `#B2DBC8` |
| attention | `#B93815` | `#FEF6EE` | `#EDC6B8` |
| neutral | `#5C5566` | `#F2F0F4` | `#CCC9D0` |

attention 和 neutral 不映射成 antd 的种子色。实心 Tag 用浅边。描边 Tag 底透明，边用前景色。

输入框边框 `#918A99` 落在 `#D3CDD9` 到 `#5C5566` 这条中性紫灰上。按 `contrast.ts` 的公式，对白底 3.33，对页面底 `#F7F5F9` 3.08，两处都超过 3。`#D3CDD9` 对白底只有 1.56。建议稿里的 `#958F9E` 对白底 3.13，对页面底只有 2.89，输入框若直接放在页面底上仍不达标，所以不采用。分割线 `#E6E1EA` 对白底 1.29，只做分割，不做控件唯一边界。

`colorBorderSecondary` 和 `colorSplit` 传 `#E6E1EA`。现在没传给 antd，表格线会落到默认灰。

导航未选中字色用实色 `#C0B6C7`。对 brand.800 的对比度是 5.88。不用半透明白。

### 2.2 字体

西文字体放在中文前面，避免 `PO14` 和日期的数字落到中文字体的西文字形上。不用 Inter、Roboto、Arial。

| 用途 | token | 值 |
| --- | --- | --- |
| 正文、表单、按钮 | `fontSize` | 14 |
| 辅助、Tag、时间戳 | `fontSizeSM` | 12 |
| 页面标题 | `fontSizeHeading1` | 20，行高 1.4，也就是 28px |
| 区块标题 | `fontSizeHeading2` | 16，行高 1.5 |
| h3 到 h5 | `fontSizeHeading3/4/5` | 14，字重 600 |
| 表格 | `cellFontSize` 三档 | 13 |
| 指标数字 | `Statistic.contentFontSize` | 28 |
| 指标标题 | `Statistic.titleFontSize` | 12 |

面包屑标出主页面名称。对象详情的可见一级标题使用 `Typography.Title` 的 `level={1}`。标题区规则见第 3 节。

最小字号 12。不要出现 11 或更小。成段中文行高 1.75。数字列 `font-variant-numeric: tabular-nums`，右对齐，千分位。

### 2.3 间距和圆角

间距阶是 4、8、12、16、24、32，与 antd 默认一致。不要在业务里使用 20。圆角 6，小圆角 4，卡片和表头用 8。控件高度 32、24、40。块与块之间用 `Flex` 的 `gap`，不要逐个写 `marginTop`。

## 3. 壳层

| 项 | 值 |
| --- | --- |
| 侧栏展开 | 208。antd 默认 200，不采用 |
| 侧栏收起 | 56。antd 默认 80，不采用 |
| 菜单项高 | 40 |
| 顶栏高 | 52。antd 默认 64，不采用 |
| 顶栏底边 | `1px solid #E6E1EA` |
| 顶栏定位 | `position: sticky; top: 0; z-index: 10` |
| 侧栏定位 | `position: sticky; top: 0; height: 100vh; z-index: 11` |
| 内容边距 | 宽度小于 1440 时 16，大于等于 1440 时 24 |
| Logo 区高度 | 52，与顶栏对齐 |

2026-11-03 实测。采购甲登录后在 `/lines`，视口 1440×900。展开时侧栏和菜单都是 208，`scrollWidth` 减 `clientWidth` 为 0，顶栏高 52。点击收起按钮后，侧栏和菜单都是 56，溢出仍是 0。菜单没有被 antd 默认的 80 撑出侧栏。`Menu` 的 `collapsedWidth` 仍写成 56，和 `Sider` 的 `collapsedWidth` 锁在一起，避免以后样式改回 80。

1279 宽不会自动收起。代码里没有 `matchMedia`。把视口改成 1279 时，只有已经手动收起的侧栏保持 56。规格要求 768 到 1279 默认收起，用 `matchMedia('(max-width: 1279px)')`。不要用 antd 的 `breakpoint="xl"`，因为 antd 的 xl 是 1200，不是 04 的 1280。小于 768 时侧栏改成抽屉菜单，点击目标至少 44。

收起按钮放在侧栏底部，用 `MenuFoldOutlined` 和 `MenuUnfoldOutlined`。现在是字符 `«` 和 `»`，见 `shell-frame.tsx` 第 50 行到第 52 行。

顶栏左侧是产品名，14 像素，字重 600，颜色 `#4A2D5E`。中间是搜索按钮，宽 280，文案「搜索单号、品名、供应商」。快捷键在 Mac 显示 `⌘K`，在 Windows 显示 `Ctrl+K`。右侧是数据新鲜度和账号菜单。来源超过 7 天用 warning。

现在顶栏不吸顶。`apps/web/src` 里没有 `sticky`。长表滚动后搜索会离开视口。

页面底是 `#F7F5F9`。内容块是白底，1 像素 `#E6E1EA` 边，圆角 8，无阴影。浮层用 antd 默认阴影。现在 `Shell.tsx` 的 `PageFrame` 把整页包进一个白框，并设了 `minHeight`。删掉这层大白框和这个 `minHeight`。空态自己占高度。

主页面用 `Breadcrumb` 标明当前位置，页面保留可访问名称。内容区只放有实际信息的摘要、次数或主操作。对象详情可以把订单号、产品名等对象身份用作标题。

内容最大宽度按页面分。列表和看板不限宽。详情 1440，左对齐。设置和周报生成这种页内表单 560。成段说明 720。

z-index 只使用 antd 的分层。顶栏 10，侧栏 11。Drawer、Modal 和搜索层用 antd 默认 1000。业务代码不写 1000 以上的 z-index。撤销提示改成 `message.open`，停留 10 秒，这样它自然在抽屉之上。

## 4. 页面模板

### 4.1 路由归哪一类

| 模板 | 路由 |
| --- | --- |
| 列表 | `/lines`、`/progress/current`、`/products`、`/reports`、`/imports`、`/master`、`/settings` |
| 详情 | `/lines/:id`、`/parties/:id`、`/products/:id`、`/reports/:id`、`/reports/:id/print`、`/imports/:id` |
| 待办 | `/today`、`/today?group=schedule` |
| 看板与排期 | `/dashboard`、`/progress/schedule`、`/progress/development` |
| 表单 | 今日抽屉、产品编辑、设置、周报生成、`/login` |

`/login` 是居中 `Card`，宽 360。已登录的 `/` 和 `/login` 按角色跳到首页。审核人在有待审时到 `/master`，管理层到 `/dashboard`，负责人到 `/reports`，只有管理员角色时到 `/settings`，只有采购角色时到 `/today`，其余进入 `/progress`。

### 4.2 列表

跟进中心是列表样板，从上到下是面包屑、筛选条、视图条、表格、分页。

行数放在结果摘要。成品线和物料线用 `Segmented` 筛选同一份列表。

筛选放在白块里，`Flex wrap gap={8}`，内边距 12。搜索框宽 280。每个 `Select` 宽 160。勾选和「清空」用 antd。每个筛选写入 URL。1280 宽放不下时，多出来的收进「更多筛选」。

视图用 `Radio.Group` `optionType="button"`。右侧放列、密度和导出。密度只有紧凑 `small` 和舒适 `middle`。视图被改过时显示「已修改」，并给出清除和保存。

有选中行时，批量条换掉视图条，位置不跳。底色 `#E8DCF0`，高 40。文案是「已选 N 行」。分配用 antd `Select`，不要原生 `select`。

表格 `size="small"`，勾选列和采购单号列 `fixed: 'left'`，`scroll={{ x: 'max-content' }}`，`sticky={{ offsetHeader: 52 }}`。去掉现在的 `scroll.y: 480`。数量列右对齐。

分页用 Table 自带的，删掉单独的 `Pagination`。

```ts
pagination={{
  placement: ['bottomEnd'],
  pageSize: 50,
  pageSizeOptions: [20, 50, 100],
  showSizeChanger: true,
  showTotal: (total) => `共 ${total} 行`,
}}
```

默认每页 50 行。2026-11-03 的实测曾一次渲染 200 行。200 作查询上限。

产品档案的卡片和表格切换用 `Segmented`，并写入 URL。导入中心用 `Upload.Dragger` 替换文件输入框。导入与审核的业务目的地在侧栏独立进入。设置从管理员账号菜单进入。

### 4.3 详情

返回是链接按钮，保留来源 URL。头部白块第一行是单号 h1、线别、阶段和负责人 `Select`。第二行用 `Descriptions`。缺值走 `MissingValue`。本次导入没有这一行时用 `Alert` `type="warning"`。

批次用 `Card` 加 `Table`。新增、改期、发货、收货打开 480 抽屉，不在页内放原生表单。来源事实用 `Collapse`，默认收起。跟进和异常在 `xl` 以上左右分栏，窄屏上下堆。详情最大宽 1440，左对齐。

导入批次的底部操作条吸在视口底，白底，上边线。按钮是「放弃这批」和「确认导入」。

### 4.4 看板

行动板在条件区显示业务日期。范围用 `Segmented`。原因用 `Tag.CheckableTag`。未分配一类提示用 `Alert`。每一组是一张 `Card`。常用动作放行内，其余进 `Dropdown`。处理完淡出 180 毫秒。`prefers-reduced-motion` 时关闭动画。`?` 打开快捷键 `Modal`。

管理看板的周期、日期和线别放在条件区。卡点、供应商表现、采购负荷、项目进度、管理周会与周报从侧栏进入。指标用 `Statistic`。状态用固定的颜色和文字表示。点指标或分段时筛选下方明细。

### 4.5 抽屉和表单

480 用于改确认日、登记发货、登记收货、记跟进、标异常、新增批次、指派。720 用于产品档案编辑、主体别名、导入冲突和跟进中心预览。

2026-11-08 决定：产品档案编辑、主体别名、导入冲突和跟进中心预览均启用 720。代码保留 `drawerWidth = 480`，新增 `drawerWide = 720`，并由对应场景显式引用。验收脚本覆盖四处 720 抽屉，并验证跟进中心预览只读、失败可关闭。

抽屉在右侧，有遮罩，Esc 关闭，URL 带 `drawer` 参数。标题用动词开头。`Form` `layout="vertical"`。字段下边距 16。固定说明放在表单顶部的 `Alert`。提交失败时顶部放 error `Alert`，保留已填内容。主按钮在 footer 最右，提交中 `loading`，取消仍可点。页内表单不进抽屉，最大宽 560，提交按钮在字段下方靠左。不可逆操作才用 `Modal.confirm`。

### 4.6 数据展示和产品档案

运营页首屏优先展示用户当前要找的内容。待办页先给行动清单，查询页先给筛选与结果，看板页先给指标及明细。确有分布或趋势问题时加入图表，最多两张。图表和指标可查对应明细。指标标明订单行、批次或任务，以及适用期间。原表目标、工厂上报、采购确认和实收使用带文字的来源标签。以角色权限提供原表行或登记记录回查入口。

- 指标卡一屏最多四个。标签用 12px 次要色，数值用 20px，数字等宽。缺值用 U+2014，不写 0。
- 阶段分布、停留天数、采购负荷用横向条形图。比例用单条横向条。时间序列用折线。不用饼图、3D、渐变或阴影。
- 图表颜色只取 `statusColor` 和 `brand` token。同一含义的颜色在全站保持一致。图例写清分段名称，点击分段可以筛选。
- 进度、今日、跟进中心保留表格或行动清单。管理看板才承担趋势和对比。分类明细超过一屏时回到表格，不做滚动图表。
- 产品档案默认卡片视图。卡片图在上、文在下，图片 4:3 裁切，无图时显示占位图标，不出现破图。整卡可点击进入详情。
- 产品表格用 antd `Table`。品名、条码列允许换行，不用 ellipsis 截断。桌面和平板提供列宽拖动柄，命中区 12px，键盘左右键每次 16px；手机端保留核心列和展开行，不显示拖动柄。

## 5. 表格实测和日期

2026-11-03，采购甲，视口 1440×900，主题尚未覆盖 `cellFontSize`。

跟进中心 `size="small"`。单元格 padding 四边都是 8px。字号 14px，line-height 22px。单行内容区是 8 加 22 加 8，等于 38px。加上 1px 行边，单行行高按 39px 验收。当时品名换行，整行量到 83px。表头 61px。表体 `max-height` 480px，一次 200 行。

进度页没有写 `size`，类名是默认的 `ant-table`，也就是 large。padding 四边 16px，字号仍是 14px，line-height 22px。单行内容区 54px，加 1px 边按 55px 验收。当时行高量到 97px，同样是换行。没有 `max-height`，200 行把整页撑得很长。

舒适档 `size="middle"` 没有任何页面在用，所以没有实测行高。规格不补一个 44。切到 middle 之后，用同一套量法重测，再把单行高度写回本节。在那之前，middle 的 padding 用本文 token 里的 12。字号三档都是 13，落地后 small 的单行会比现在的 39px 略矮，以新的实测替换 39，仍然不写 36。

表格日期和详情时间按第 1 节第 3 条。现在没有统一的格式化函数。收到 `apps/web/src/shared/ui/format.ts`。数量用 `Intl.NumberFormat('zh-CN')`，整数不带小数。金额字段当前不存在。规则先冻结为 `¥` 加千分位加两位小数，右对齐。

## 6. 状态、空、加载、错误

### 6.1 状态 Tag

状态是图标、文字和颜色。图标来自 `@ant-design/icons`。实心用 `Tag` `variant="filled"`。描边用 `variant="outlined"`。不要写 `color="red"` 这种颜色名。

已有 `status.ts` 的键保持文案不变。领域词表里还有一批状态没有进 `STATUS_SPEC`。批次、订单行阶段、送货单、异常、导入、关联、审核都要进同一张表，用同一个 `StatusTag` 渲染。

键名现在不一致。领域 `flow.ts` 用 `demand_before_confirmed`、`missing_date`、`shipped_not_received`。界面 `status.ts` 用 `required_before_confirmed`、`missing_confirmed`、`shipped_waiting`。合并时保留领域键，界面只做显示映射，不要再造第三套名字。

总表状态「已完成」「进行中」「未开始」一律中性描边。那是来源数据，不和订单行阶段抢颜色。

### 6.2 缺值

缺值符号是 U+2014。不要用连字符或全角减号。颜色用 `#6E6777`。选中行底是 `#D3C3E8` 或 `#C2AED5` 时，缺值改用 `#1F1A24`。`#6E6777` 在这两层底上只有 3.29 和 2.66。原因放在 antd `Tooltip` 里，键盘聚焦也能看到。原因词只用未填写、原文无法识别、代工厂表无对应记录、不适用、暂无数据来源。数字列里的缺值右对齐。一律走 `MissingValue`。不要把缺失显示成 0。

`ProgressPage.tsx` 的到货标签直接返回字符串缺值，没有颜色和原因。物料线「代工厂需求日」的 `factoryRequiredCell` 不读行，永远返回缺值符号。列表契约里没有这个日期。列要么接上批次上的日期，要么不要出现。

### 6.3 空、加载、错误

表格空态用 `Empty` 的简图，文案写成「现状。下一步。」并带一个下一步按钮。筛选后为空时，下一步是清空筛选。今日没有待办时用默认插图，按钮是「去跟进中心」。

首次进入用 `Skeleton`。表格首次加载可以用 `loading` 加空数据。再次请求按第 1 节第 2 条。看板指标用 `Card` 的 `loading`。不要用整页 `Spin` 挡住已有内容。

今日在 `isReady` 为假时 `return null`，见 `TodayBoard.tsx` 第 73 行。这是白屏。改成骨架。

整页读失败用 `Result` `status="error"`。标题沿用「X 没有读出来」。副标题给错误码的中文名和怎么办。按钮是重试和返回。无权限用 403，「这个角色看不到这页。」找不到用 404。会话过期用 warning，「登录过期了。」区块失败用 `Alert` `type="error"` 加重试。不要只写「加载失败」。

## 7. 文案和禁止项

按钮用动词开头。状态名只用领域词表。工作台登记和 SRM 收货不要混用。错误提示写发生了什么，以及下一步怎么办。

禁止这些做法。

- 不把指标、计数、样本数写成常数。查询返回空集合时，页面要能看出是没有数据，而不是查询被写成空数组。
- 不留点了没有请求、也没有反馈的按钮。配置缺失时可以禁用，但禁用条件必须读配置，并写明原因。
- 不用原生 `h1`、`table`、`select`、`button`、`form`、`input`、`details` 拼页面。文件选择用 `Upload`。
- 不在 `tokens.ts` 和 `antd.ts` 以外写十六进制颜色。
- 不安装 Ant Design Pro。
- 不把 antd 默认蓝 `#1677ff`、红 `#ff4d4f`、金 `#faad14`、绿 `#52c41a` 留在界面上。
- 抽屉不出现 480 和 720 以外的宽度。

## 8. 截图验收

在 1280、1440、1920 三个宽度下，各截跟进中心、订单行详情、今日、管理看板，并打开 480 与 720 抽屉。跟进中心预览额外验证 URL 会话、只读内容和失败关闭入口。每一条都能量到或判断。

1. 页面内没有 `#1677ff`、`#ff4d4f`、`#faad14`、`#52c41a`。抽查主按钮、链接、Alert、校验文字和涨跌色。
2. Alert info 和 message info 是 `#1849A9`，不是紫色。
3. 主按钮悬停是 `#6D4C83`，是变深，不是变浅。
4. 缺值、占位和说明文字是 `#6E6777`。`contrastPairs` 含 tertiary，单测通过，对比度至少 4.5。
5. 实心 Tag 的边是浅色，描边 Tag 的底透明。`rg` 搜 `Tag color=` 结果为 0。
6. 选中行底色是 `#D3C3E8`，选中后悬停是 `#C2AED5`。选中行里的链接用 `#4A2D5E`。
7. 主页面的面包屑标明当前位置，内容区无重复页面名。详情页的可见对象标题字号 20，行高 28。区块标题 16。
8. 表格正文和表头都是 13px。表头颜色 `#5C5566`。没有小于 12px 的文字。
9. 数字列右对齐、等宽、有千分位。同一列的个位上下对齐。
10. 字体栈西文在前。DevTools 里 `PO14` 的数字使用系统西文字形。
11. 侧栏展开 208，收起 56。收起后菜单宽度等于侧栏，不溢出。
12. 顶栏高 52，滚动后仍在顶部。浮层盖住顶栏。
13. 1280 下内容左右边距 16。1440 及以上是 24。1279 宽自动收起侧栏。
14. 页面底是 `#F7F5F9`。内容块白底加 1px `#E6E1EA`。没有整页大白框。只有浮层有阴影。
15. 收起按钮是图标，不是 `«` 或 `»`。
16. 跟进中心默认每页 50 行。分页在表格右下，有「共 N 行」和 20、50、100。没有独立的 `Pagination`。
17. 紧凑档单行按第 5 节的实测验收。当前主题下是 39px。品名换行可以更高。不要求 36 或 44。舒适档在有 `size="middle"` 的页面后，用同一次量法重测再勾。
18. 首列和勾选列在横向滚动时固定。表头吸在顶栏下方。
19. 选中行后批量条替换视图条，页面不跳动。批量条里没有原生 `select`。
20. 改筛选后刷新，状态还在。URL 带这些参数。
21. 订单行详情、主数据、产品、周报、设置、导入页的源码里没有原生 `h1`、`h2`、`table`、`select`、`button`、`details`。
22. 抽屉宽度只有 480 和 720。提交按钮在底部右侧，主按钮在最右。提交中显示 loading。报错在表单顶部，已填内容还在。
23. 抽屉 footer 按钮的左右边与正文对齐，都是 24。
24. 今日、跟进中心、看板首次加载是骨架，不白屏。用 Slow 3G 截图。
25. 断网或接口 500 时，整页是 Result，「X 没有读出来」，带错误码中文名、重试和返回。
26. 每个空态都有一句说明和一个下一步按钮。
27. 每个缺值悬停和键盘聚焦都能看到原因，用的是 antd Tooltip。
28. 今日处理完一行，淡出约 180 毫秒。系统开启减少动态效果时没有动画。
29. 撤销提示停留 10 秒，层级在抽屉之上。
30. 跟进中心日期同年是 `MM-DD`，跨年是 `YYYY-MM-DD`。详情和审计时间是 `YYYY-MM-DD HH:mm`。时区是上海。

输入框边框另测一条。取色是 `#918A99`。对白底至少 3.33，对页面底至少 3.08。

## 9. 以后用脚本卡住的规则

这些规则这次不接入流水线。下一轮可以做成 `pnpm` 脚本或 eslint，失败即不合。

1. `apps/web/src/pages` 和 `apps/web/src/app` 里不允许原生 `select`、`button`、`table`、`textarea`、`h1`、`h2`、`details`。`input` 只允许出现在 antd 组件内部。文件选择必须是 `Upload`。
2. 十六进制颜色只允许出现在 `theme/tokens.ts` 和 `theme/antd.ts`。
3. `colorInfo` 不得等于 `colorPrimary`。
4. `contrastPairs` 必须包含 tertiary 对白底、tertiary 对页面底、白字对 brand.600、白字对主按钮悬停色、输入框边框对白底、输入框边框对页面底。文字组合低于 4.5 或边框组合低于 3 则失败。
5. 跟进中心默认页大小是 50。地址栏缺省时不得返回 200。
6. 抽屉宽度字面量只允许 480 和 720。
7. 页面不得调用 `feishuButton(false)` 或其他把展示用开关写成常数的写法。禁用必须来自配置或接口。
8. `TodayBoard` 在数据未返回时不得 `return null`。

## 10. 面向客户的查询与看板整理

本节是下一轮设计提案。核对主线与 PR #46 后，沿用 PR 的六个入口、可展开侧栏和面包屑。下一步统一页面的条件、结果、主操作和下钻位置。新增客户身份、数据范围和对外路由须独立验收。[页面清单](apps/web/src/app/page-manifest.tsx) · [侧栏子页面](apps/web/src/app/navigation-destinations.ts) · [现有角色](packages/domain/src/vocabulary/identity.ts) · [PR #46](https://github.com/tyuanww/shinemage-supply-workbench/pull/46)

### 10.1 入口按用户要查的对象设计

| 用户与问题 | 首屏与下钻 | 数据范围 |
| --- | --- | --- |
| 消费者。我的商品到哪了，什么时候到？ | 手机优先。从本人订单进入。用 `Card` 展示当前状态、已对外承诺的到货时间和最近更新。用 `Timeline` 展示订单与物流节点，用 `Descriptions` 展开商品、包裹和签收详情。 | 核验订单所有权。仅展示本人订单、已发布节点和本人包裹。没有确认时间时显示「暂未确认」，显示下一步查询或联系入口。 |
| B 端客户。我们的哪笔订单有风险，有多少待交？ | 默认进入本企业交付列表。用 `Input.Search`、`Select` 和日期筛选查询客户单号、SKU、交付状态。桌面 `Table`，窄屏保留单号、状态、承诺日和未交数量。点击订单查分批交付、变更记录及允许下载的凭据。 | 服务端按企业和授权范围取数。批准的字段可展示承诺日、交付量和时间线。查询、汇总、导出及附件共享同一权限。 |
| 内部员工。今天先做什么，单据在哪里，风险集中在哪？ | 按现有角色进入六个业务板块。每页围绕待办、查询或决策中的一个问题设计。面包屑标明当前位置，详情保留来源筛选。 | 按现有页面和 API 能力授权。管理指标、工厂信息、内部跟进、导入审计和成本保留在内部授权范围。 |

消费者订单号、B 端客户单号与内部采购单是不同标识。先确认零售订单及物流来源、B 端企业和客户单映射、已承诺日期的发布方与时效，再开发外部查询。工厂排产、内部需求日、采购确认日、预计送达和实际签收各自显示，外部页面只使用获准发布的事实。内部现场登记和外部配送状态各自追溯到对应来源。

### 10.2 三种共用模板

| 模板 | 首屏顺序 | 主操作与下钻 |
| --- | --- | --- |
| 待办页 | 面包屑、业务日期和范围、按紧急程度组织的行动清单 | 每条优先展示一个当前动作。用 `List` 或 `Card`，用 `Drawer` 办理短操作。完成后回读结果。 |
| 列表页 | 面包屑、搜索和常用筛选、结果数、列表 | 保留一个页面主操作。有选中行时再显示批量动作。详情预览用 `Drawer`，可独立回查的对象详情用页面。 |
| 看板页 | 面包屑、期间和范围、关键指标、对应明细 | 指标用 `Statistic`，状态用共享 `StatusTag`。点指标即筛选同页明细，点明细打开对象。 |

桌面把搜索与常用筛选放在同一条件区，窄屏保留搜索、当前范围和主操作，其余筛选用「更多筛选」收起。内部查询把可恢复的条件写入 URL。对外查询深链只保留允许分享的标识与条件。关详情、返回和刷新后，恢复筛选、分页及刚看的对象。三个模板复用 `Breadcrumb`、共享状态和主题 token，区分加载、无结果、无权限、数据过期和请求失败。[共享组件](apps/web/src/shared/ui/widgets.tsx) · [主题 token](apps/web/src/theme/tokens.ts)

### 10.3 内部六个板块怎么设计

| 板块 | 首屏问题和内容 | 查询、操作与下钻 |
| --- | --- | --- |
| 今日事项 | **行动板**回答「今天先处理什么」。按待催、待建批次、到仓待收给清单，行内显示原因、日期、等待谁。**今日排期**回答「今天承诺做完哪些任务」，分今日、逾期、前置阻塞。 | 行动板按业务事实推导。点一行处理批次，回读待办结果。排期按独立任务状态展示，点一行看负责人、依赖和记录。 |
| 管理店铺 | **当前进度**按店铺查哪款货受影响。**总排期**按周查临近交付和冲突。**新品开发进度**按项目查看当前阶段和下个里程碑。 | 当前进度保留店铺、单号、品名、阶段和下一交期。总排期首屏优先给最近几周和延期项目。新品下钻到里程碑与关联采购。 |
| 跟进中心 | 回答「哪一单、哪一批出了什么事」。搜索优先，常显单号、品名、阶段、下一到货、负责人。首屏直接给明细表。 | 用单号、品名、编码和阶段缩小列表。行内打开订单预览，有需要时进入可分享的内部详情，查看批次、发收和原表来源。登记及批量操作依权限提供。 |
| 管理看板 | 回答「这段时间最该处理哪类风险」。用明确单位和日期范围的指标定位风险，再给对应记录。 | 指标下钻保留统计范围，具体视图见第 10.4 节。 |
| 产品档案 | 回答「这是什么产品」。首屏按品名或条码查图、规格和条码。 | 详情展示采购记录、库存来源和 BOM。列表当前只加载基础档案，待汇总数据契约确认后再评审列表指标。BOM 表达组成。 |
| 导入与审核 | **导入中心**回答「这批文件能否提交」。审核视图回答「哪条来源数据需核对，怎么判」。 | 用上传、预览、差异、确认和回执组织导入。审核按别名、一号多名、负责人及工厂关联进入对应队列，详情并排展示原值、候选项和判断记录。 |

### 10.4 管理看板各视图

| 视图 | 首屏和下钻 |
| --- | --- |
| 卡点 | 以待处理批次为主体，展示卡点原因、风险数量和最早需处理日期。点击原因看匹配的批次，再打开事实与跟进。 |
| 供应商表现 | 按期间比较交付与延期。每个比例附分母和样本数。点供应商看同期间交付批次。 |
| 采购负荷 | 按负责人比较待处理量和高风险量。点负责人打开相同口径的明细，包含未分配。 |
| 项目进度 | 按项目看受阻任务、下一里程碑和责任人。点项目进入任务列表，再看依赖。日常排程由管理店铺提供。 |
| 管理周会 | 先看未完成决定、负责人和到期日。每条决定关联原始卡点或项目，能回读完成记录。 |
| 周报（待开发） | 保留现有内部周报入口与可回查版本。下一轮方案按周、生成时间和版本找冻结快照，提供授权的导出和历史回查。 |

### 10.5 先验收四个页面和一条链路

1. 并排评审今日事项、跟进中心、管理店铺和管理看板。共同样例用一笔逾期、部分到货的订单。分别核对采购打开后先点哪里、产品经理怎么看店铺受影响、管理层如何追到同一批次。窄屏核对第一屏能看到的状态、下一步和折叠的条件。
2. 稿子通过后，先交付「今日事项 → 跟进中心 → 订单详情」的可点样板。用隔离库验证筛选、同一批次事实、返回上下文，以及空、失败和无权限状态。沿用第 8 节的尺寸，并加一档手机视口。
3. 一个业务板块通过一组可复核的查询任务后再推广。客户查询分角色验收。消费者用本人与他人订单，B 端用同企业和跨企业记录，分别验证直接地址、汇总、附件和导出。资料来源与角色范围获确认后开发。
4. 人工评审确认每一屏的首屏信息与下一步。CI 验已定下的导航、查询恢复、可访问性和授权规则。验收记录区分设计稿、实际功能、隔离库和生产状态。

## 11. 内部页面组件与验收

以下规则用于现有六个板块。组件走 `ConfigProvider` 的项目主题。页面复用 `WorkspaceBreadcrumb`、`WorkbenchPage`、`SectionGroup`、`MetricStrip`、`StatusTag` 和 `SourceTag`。当信息可以按行对照时使用 `Table`，单个对象的字段用 `Descriptions`。图表的多段分布和业务时间轴可以保留专用绘制，卡片、详情入口与操作仍使用 antd。[页面主题](apps/web/src/theme/antd.ts) · [页面布局](apps/web/src/shared/ui/page.tsx) · [业务状态组件](apps/web/src/shared/ui/widgets.tsx)

| 入口 | 元素与用户需求 | 组件与验收 |
| --- | --- | --- |
| 今日事项 · 行动板 | 从待催、待建批次和到仓待收找当前要处理的批次。按等待方、原因或日期分组。 | 分组选择用 `Segmented`，业务组用 `Card`，打开处理面板用 `Drawer`。用键盘打开同一批次，并核对日期、原因及数量。 |
| 今日事项 · 今日排期 | 按排期、负责人或供应商看任务。任务可能依赖前置事项。 | `Segmented` 切换分组，任务按钮打开详情 `Drawer`。查看逾期和前置阻塞，关闭后仍在原分组。 |
| 管理店铺 · 当前进度 | 用店铺和订单条件查交付影响。查询成功、无匹配与读取失败需要不同反馈。 | 筛选放在页面顶部，停留天数紧跟 OA。进度分布用紧凑环形图展示订单行阶段构成，图例可筛选。表格在页面宽度内显示核心列，辅助资料从行内展开。刷新和详情返回保留筛选。 |
| 管理店铺 · 总排期 | 用日期窗口找订单与关键节点，按阶段输入齐料、生产、交付用时。 | 用 `Form.Item` 标注 `Input`、`InputNumber`。保留周期预览、业务日期校验与版本记录。核对保存后节点可以回查。 |
| 管理店铺 · 新品开发进度 | 查项目当前阶段、预测日期与关联采购，项目有独立的任务和事件。 | `Card` 组织首屏，`Descriptions` 与 `Timeline` 展示对象事实和节点。审核或更改仍走现有授权。 |
| 跟进中心 · 列表和订单详情 | 按单号、品名或编码定位，保存常用筛选。打开订单核对批次、在途和实收。 | 复用 `Input.Search`、`Table` 与只读 `Drawer`。保存视图用 `Modal` 与明确命名的输入框。核对键盘关闭、刷新恢复、保存后回读及原订单链接。 |
| 管理看板 · 卡点、供应商、采购 | 先看期间和业务线，再定位原因、供应商或负责人。比例要能追到期间和样本。 | `Statistic` 或共享指标卡显示单位，`Progress` 表达准时率。指标和表格下钻携带现有查询条件，抽屉显示关联批次。 |
| 管理看板 · 项目、周会、周报 | 沿项目查任务，沿周会决定查责任人和到期日，按周查已生成的报表版本。 | 用 `Card`、`Table` 和 `Form` 表达不同对象。核对可读和可写角色、冻结版本及报表导出。 |
| 产品档案 | 按品名或条码找产品，在图卡与表格间切换。详情回查采购、库存与 BOM。 | `Input.Search` 配合 `Segmented`、`Card` 和 `Table`。输入条码后按 Enter，刷新及从详情返回保留查询。无匹配时提供清除查询。 |
| 导入与审核 · 导入中心 | 选择模板和文件，先看批次状态与差异，再处理或回查历史。 | 使用 `Form`、`Upload.Dragger`、表格或列表及状态标签。核对预览、历史筛选和来源批次链接。 |
| 导入与审核 · 队列和诊断 | 对照原始信息和候选记录。需要明确待处理、当前和历史关联范围。 | 使用 `Select`、`Tag`、`Table` 和抽屉。核对方向、深链、查询范围和审核角色。 |

客户查询的场景与访问条件见第 10.1 节。客户原型与正式数据接入分别验收。

## 12. 红方复核修复任务卡

按错办、误判、回查中断和布局的顺序验收。浏览器用合成订单或一次性 PostgreSQL。

| 卡 | 工作项 | 通过条件 |
| --- | --- | --- |
| R01 | 跟进中心的查询、选择和批量目标 | 查找第二张订单后，旧选中项与旧操作消失。新请求失败时显示重试。批量请求只使用当前可见查询选中的订单行。 |
| R02 | 卡点的来源失败与批次回查 | 模拟来源读取失败可见提示并可重试。同一采购单的两批可以用批次序号区分并打开各自的订单行批次。 |
| R03 | 产品目录可信度 | 同一商品的卡片和表格按条码准确定位。备案名与对应商品同时展示，空值显示待补充。目录只展示已取得的字段，采购、库存和 BOM 在详情回查。 |
| R04 | 详情返回与键盘焦点 | 跟进中心与当前进度的查询条件和页码可恢复。关闭跟进预览后回到原按钮。 |
| R05 | 窄屏排期和卡片层级 | 320px 首屏保留具体任务，次要筛选可展开。当前进度的筛选允许换行，订单清单按可用宽度显示。共享指标与产品卡按可用空间排列。 |

## 13. 跨页交互改版任务卡

独立业务页面从侧栏进入。一个对象有几块可单独阅读的内容时，用共享 `ContentTabs` 切换。对同一批记录改分组、线别、密度或展示方式时，用共享 `ViewSwitch`。它们分别使用 Ant Design 的 `Tabs` 和 `Segmented`。多选条件和审核表单保留各自的输入语义。[共享切换组件](apps/web/src/shared/ui/view-switch.tsx)

按钮沿用 Ant Design `Button` 与项目主题。保存、确认、提交等推进当前任务的操作用主按钮，同组的关闭和取消用普通按钮。行内入口靠近记录，批量操作随选中行出现。筛选贴着结果，表格上方放结果数和显示选项。[全局配置](apps/web/src/app/main.tsx) · [主题](apps/web/src/theme/antd.ts)

| 任务卡 | 业务与改动 | 验收动作 |
| --- | --- | --- |
| U01 公共组件 | 复用内容页签、视图切换和主按钮，用同一套指标栅格展示数量、单位和筛选状态。 | 窄屏能读到完整指标。风险计数为零时去掉强调边线，选中指标仍可辨认。 |
| U02 今日事项 | 工厂催货、内部等回单与到仓待收各自标明范围。每条先给批次、可核实的数量、等待方和当前动作。 | 点催货批数能逐条核对匹配批次，包括后续页。内部回单和其他待办均可找回，复制催单只含可催货批次。今日排期按独立任务状态查询。 |
| U03 管理店铺 | 当前进度按开放批次的当前采购确认到货日识别逾期，再按订单行去重。手机列表保留完整单号和可区分的商品规格。总排期、新品开发从侧栏分别进入。 | 一单两批只有一批逾期时，指标和下钻都计一行。选择指定渠道装，展开后能核对单号、日期和下一步。 |
| U04 跟进中心 | 搜索与常用条件在结果前，视图工具收在一起。订单预览区分订单行的下一到货与各批确认日。数据列与列头建立语义关联。 | 同一订单按单号和逾期都能找到。键盘进入预览，关闭回原行。桌面和手机均能按列名辨认数量及日期。 |
| U05 管理看板 | 卡点按截至业务日的开放批次统计，期间仅用于期间指标。批次详情内核对等待方、内部跟进人、未发、在途和实收。 | 从风险指标进入具体批次，核对数量和单位。行动板与看板对同一事项给出相同等待方。周报入口标明待开发。 |
| U06 产品档案 | 品名、条码、渠道规格和箱规支持辨认相似商品。结果和详情保持商品身份，无图商品以文字为主。 | 以同一基础条码找到普通装和渠道装，进详情读净含量和箱规。返回保留查询、视图并回焦原商品。 |
| U07 导入与审核 | 按选文件、解析、核对、提交结果组织操作。列表与批次详情保留文件、归属工厂、状态与已知错误。 | 键盘选文件只有一个入口。用隔离库样本提交后，打开该批核对结果，返回原筛选与原记录。 |
| U08 跨页收尾 | 用同一组数据对照桌面和手机的查询、下钻与返回。外部查询的身份、来源和字段范围按第 10.1 节单独验收。 | 用一单两批、不同日期和部分发收验证数量。键盘与手机核对关键标识，真实岗位独立操作后签收。 |
