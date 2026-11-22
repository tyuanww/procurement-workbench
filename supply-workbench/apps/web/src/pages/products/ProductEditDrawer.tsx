import { Alert, Drawer, Typography } from 'antd';
import { sourceAfterEdit } from '../../features/product-archive/index.js';
import type { UiNotice } from '../../shared/ui/notice.js';
import { drawerWide } from '../../theme/tokens.js';
import {
  ContactEditor,
  EditSection,
  ImageEditor,
  NameEditor,
  type MaintainProps,
} from './product-edit-sections.js';

export type ProductEditDrawerProps = MaintainProps & {
  readonly isOpen: boolean;
  readonly message: UiNotice | null;
  readonly onClose: () => void;
};

export function ProductEditDrawer(props: ProductEditDrawerProps) {
  return (
    <Drawer
      placement="right"
      size={drawerWide}
      open={props.isOpen}
      onClose={props.onClose}
      title="编辑产品"
    >
      {props.message === null ? null : (
        <Alert style={{ marginBottom: 16 }} type={props.message.kind} showIcon title={props.message.text} />
      )}
      {props.edited ? (
        <Typography.Paragraph type="secondary">
          {sourceAfterEdit() === 'workbench' ? '工作台' : ''}
        </Typography.Paragraph>
      ) : null}
      <EditSection title="名称">
        <NameEditor input={props} />
      </EditSection>
      <EditSection title="图片">
        <ImageEditor input={props} />
      </EditSection>
      <EditSection title="联系人">
        <ContactEditor input={props} />
      </EditSection>
    </Drawer>
  );
}
