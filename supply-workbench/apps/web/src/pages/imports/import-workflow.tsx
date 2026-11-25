import { Steps } from 'antd';
import type { ImportStatus } from '@sw/domain';
import { space } from '../../theme/tokens.js';

type ImportStage = 'choose' | 'parse' | ImportStatus;

const stepTitles = ['选文件', '解析', '核对', '提交结果'];
const position = { choose: 0, parse: 1, failed: 1, parsed: 2, discarded: 3, committed: 3 } satisfies Record<ImportStage, number>;

export function ImportWorkflow({ stage }: { readonly stage: ImportStage }) {
  const current = position[stage];
  const isFinished = stage === 'committed' || stage === 'discarded';
  return (
    <div aria-label="导入流程" role="group" style={{ paddingBlock: space[1], marginBottom: space[3], maxWidth: 560 }}>
      <Steps type="dot" size="small" responsive={false} current={current}
        status={stage === 'failed' ? 'error' : isFinished ? 'finish' : 'process'}
        items={stepTitles.map((title, index) => ({ title: <span aria-current={index === current ? 'step' : undefined}>{title}</span> }))} />
    </div>
  );
}
