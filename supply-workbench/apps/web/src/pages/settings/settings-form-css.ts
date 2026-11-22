export function settingsFormCss(): string {
  return `@media (max-width: 600px) {
    .settings-form .ant-form-item-label { flex: 0 0 112px !important; max-width: 112px !important; padding-top: 5px; }
    .settings-form .ant-form-item-control { flex: 1 1 auto !important; max-width: none !important; min-width: 0; }
    .settings-form .ant-form-item-control-input-content, .settings-form .ant-slider { min-width: 0; }
  }`;
}
