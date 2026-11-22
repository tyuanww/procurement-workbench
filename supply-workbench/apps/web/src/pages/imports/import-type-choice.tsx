import { Collapse, Select, Typography } from 'antd';
import { templateIdLabel, type TemplateId } from '@sw/domain';
import { selectedTemplate, topIsTied, type DetectCandidate, type ImportTypeChoice } from '../../features/imports/index.js';

export function ImportTypeChoices(props: {
  readonly candidates: readonly DetectCandidate[];
  readonly choice: ImportTypeChoice;
  readonly onChoose: (template: TemplateId) => void;
}) {
  const options = props.candidates.map((item) => ({ value: item.template, label: candidateLabel(item) }));
  return (
    <>
      <Select<TemplateId>
        id="import-template"
        options={options}
        virtual={false}
        value={selectedTemplate(props.choice)}
        onChange={props.onChoose}
        placeholder="请选择导入类型"
      />
      {props.choice.kind === 'unselected' ? (
        <Typography.Text type="secondary">
          {topIsTied(props.candidates) ? '识别分数并列，请手动选择。' : '请核对文件后选择导入类型。'}
        </Typography.Text>
      ) : null}
    </>
  );
}

export function ImportDetectionDetails({ candidates }: { readonly candidates: readonly DetectCandidate[] }) {
  const diagnostics = (
    <ul style={{ overflowWrap: 'anywhere', marginBlock: 0 }}>
      {candidates.map((item) => (
        <li key={item.template}>{candidateLabel(item)}{item.reasons.length === 0 ? '' : ` · ${item.reasons.join('，')}`}</li>
      ))}
    </ul>
  );
  return <Collapse ghost size="small" items={[{ key: 'diagnostics', label: '查看识别说明', children: diagnostics }]} />;
}

function candidateLabel(item: DetectCandidate): string {
  return `${templateIdLabel(item.template)} · ${item.score} 分`;
}
