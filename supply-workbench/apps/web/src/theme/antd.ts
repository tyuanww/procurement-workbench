import { theme, type ThemeConfig } from 'antd';
import {
  bg,
  border,
  brand,
  controlBorder,
  fontFamily,
  onBrand,
  primaryHover,
  statusColor,
  text,
} from './tokens.js';

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
    colorInfo: statusColor.info.text,
    colorInfoText: statusColor.info.text,
    colorInfoBg: statusColor.info.bg,
    colorInfoBorder: statusColor.info.border,
    colorSuccess: statusColor.success.text,
    colorSuccessText: statusColor.success.text,
    colorSuccessBg: statusColor.success.bg,
    colorSuccessBorder: statusColor.success.border,
    colorWarning: statusColor.warning.text,
    colorWarningText: statusColor.warning.text,
    colorWarningBg: statusColor.warning.bg,
    colorWarningBorder: statusColor.warning.border,
    colorError: statusColor.danger.text,
    colorErrorText: statusColor.danger.text,
    colorErrorBg: statusColor.danger.bg,
    colorErrorBorder: statusColor.danger.border,
    colorText: text.primary,
    colorTextHeading: text.primary,
    colorTextSecondary: text.secondary,
    colorTextTertiary: text.tertiary,
    colorTextDescription: text.tertiary,
    colorTextPlaceholder: text.tertiary,
    colorIcon: text.tertiary,
    colorBorder: controlBorder,
    colorBorderSecondary: border,
    colorSplit: border,
    colorBgLayout: bg.page,
    colorBgContainer: bg.surface,
    colorBgElevated: bg.surface,
    fontFamily,
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
      headerBg: bg.surface,
      headerHeight: 52,
      headerPadding: '0 16px',
      bodyBg: bg.page,
    },
    Menu: {
      collapsedWidth: 56,
      itemHeight: 40,
      darkItemBg: brand[800],
      darkSubMenuItemBg: brand[800],
      darkPopupBg: brand[800],
      darkItemColor: onBrand.muted,
      darkItemHoverColor: onBrand.solid,
      darkItemHoverBg: 'rgba(255,255,255,0.08)',
      darkItemSelectedBg: brand[600],
      darkItemSelectedColor: onBrand.solid,
    },
    Table: {
      headerBg: bg.page,
      headerColor: text.secondary,
      headerSplitColor: 'transparent',
      rowHoverBg: bg.page,
      rowSelectedBg: brand[200],
      rowSelectedHoverBg: brand[300],
      borderColor: border,
      cellFontSize: 13,
      cellFontSizeMD: 13,
      cellFontSizeSM: 13,
      cellPaddingBlockSM: 8,
      cellPaddingInlineSM: 8,
      cellPaddingBlockMD: 12,
      cellPaddingInlineMD: 12,
    },
    Statistic: { contentFontSize: 28, titleFontSize: 12 },
    Button: { primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
    Segmented: { trackBg: bg.page, itemSelectedBg: brand[100], itemSelectedColor: brand[800] },
    Tabs: { itemSelectedColor: brand[800], inkBarColor: brand[600] },
    Tag: { defaultBg: statusColor.neutral.bg, defaultColor: statusColor.neutral.text },
    Drawer: { footerPaddingBlock: 12, footerPaddingInline: 24 },
  },
};

const nativeControlBorder =
  `input:not([class^="ant-"]):not([class*=" ant-"]),select:not([class^="ant-"]):not([class*=" ant-"]),textarea:not([class^="ant-"]):not([class*=" ant-"]),button:not([class^="ant-"]):not([class*=" ant-"]){border-color:${controlBorder}}input:not([class^="ant-"])::placeholder,textarea:not([class^="ant-"])::placeholder{color:${text.tertiary};opacity:1}`;

const mobileSegmented =
  '@media (max-width:767px){.shell-page .ant-segmented{max-width:100%;overflow:visible}.shell-page .ant-segmented-group{flex-wrap:wrap}.shell-page .ant-segmented-thumb{display:none}}';

const selectedRowLink =
  `.missing-value{color:${text.tertiary}}.ant-table-tbody>tr.ant-table-row-selected>td a,.ant-table-tbody>tr.ant-table-row-selected>td a:hover{color:${brand[800]}}.ant-table-tbody>tr.ant-table-row-selected>td .missing-value{color:${text.primary}}`;

const hiddenMeasurementRows = '.ant-table-measure-row[aria-hidden="true"]{visibility:hidden}';

export const themePatchCss = `${nativeControlBorder}${selectedRowLink}${mobileSegmented}${hiddenMeasurementRows}`;

export function paintedTheme() {
  return theme.getDesignToken(antdTheme);
}
