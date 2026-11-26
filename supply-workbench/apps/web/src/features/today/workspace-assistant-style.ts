export const workspaceAssistantCss = `
.today-assistant h2,
.today-assistant h3,
.today-assistant dl,
.today-assistant dd {
  margin: 0;
}

.today-assistant h2 {
  font-size: var(--ant-font-size-lg);
}

.today-assistant .ant-card-head,
.today-schedule-list .ant-card-head {
  min-block-size: 56px;
  padding-inline: var(--ant-padding);
}

.today-schedule-overview {
  container: today-action / inline-size;
  display: grid;
  gap: 16px;
}

.today-schedule-list h2 {
  margin: 0;
  font-size: var(--ant-font-size-lg);
}

.today-assistant h3 {
  color: var(--ant-color-text-secondary);
  font-size: var(--ant-font-size-sm);
  font-weight: 600;
}

.today-assistant-hint {
  margin: var(--ant-padding);
  padding: var(--ant-padding-sm);
  background: var(--ant-color-bg-layout);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: var(--ant-border-radius);
}

.today-assistant-prompts,
.today-assistant-waiting {
  padding: var(--ant-padding);
}

.today-assistant-prompts {
  display: grid;
  gap: var(--ant-padding-xs);
}

.today-assistant-hint + .today-assistant-prompts {
  padding-block-start: 0;
}

.today-action-shortcuts.today-assistant .ant-btn {
  justify-content: space-between;
}

.today-assistant-prompts > button {
  min-block-size: var(--ant-control-height);
}

@container today-action (max-width: 28rem) {
  .today-assistant-prompts > button {
    min-block-size: 44px;
  }
}

.today-assistant-waiting dl > div {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ant-padding-xs);
  padding-block: var(--ant-padding-xs);
}

.today-assistant-waiting:not(:first-child),
.today-assistant-waiting dl > div + div {
  border-block-start: 1px solid var(--ant-color-border-secondary);
}

.today-assistant-waiting dd {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
`;
