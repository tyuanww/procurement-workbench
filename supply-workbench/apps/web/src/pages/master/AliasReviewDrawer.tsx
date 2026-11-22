import { Alert, Button, Checkbox, Drawer, Flex, Form, Select, Typography } from 'antd';
import type { PartyAliasView } from '@sw/contracts';
import { linkNeedsConfirm } from '../../features/master-data/index.js';
import { horizontalFormLayout } from '../../shared/ui/form.js';
import { drawerWide } from '../../theme/tokens.js';

export type AliasRoles = {
  readonly isSupplier: boolean;
  readonly isFactory: boolean;
};

export type AliasReviewDrawerProps = {
  readonly alias: PartyAliasView;
  readonly open: boolean;
  readonly partyId: string;
  readonly roles: AliasRoles;
  readonly confirmed: boolean;
  readonly isSubmitting: boolean;
  readonly error: string;
  readonly onParty: (partyId: string) => void;
  readonly onRoles: (roles: AliasRoles) => void;
  readonly onConfirm: () => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
};

export function AliasReviewDrawer(props: AliasReviewDrawerProps) {
  const target = props.alias.similar.find((item) => item.partyId === props.partyId);
  const isBlocked = target !== undefined && linkNeedsConfirm({ rawName: props.alias.rawName, partyName: target.displayName, confirmed: props.confirmed });
  const canCreate = props.partyId !== '' || props.roles.isSupplier || props.roles.isFactory;
  return (
    <Drawer
      placement="right"
      size={drawerWide}
      open={props.open}
      onClose={props.onClose}
      title="审核主体别名"
      footer={<Flex justify="flex-end"><Button type="primary" loading={props.isSubmitting} disabled={props.isSubmitting || isBlocked || !canCreate} onClick={props.onSubmit}>通过</Button></Flex>}
    >
      <AliasReviewFields {...props} />
    </Drawer>
  );
}

export function AliasReviewFields(props: AliasReviewDrawerProps) {
  const target = props.alias.similar.find((item) => item.partyId === props.partyId);
  const isBlocked = target !== undefined && linkNeedsConfirm({ rawName: props.alias.rawName, partyName: target.displayName, confirmed: props.confirmed });
  return (
    <>
      {props.error === '' ? null : <Alert type="error" showIcon title={props.error} style={{ marginBottom: 16 }} />}
      <Form {...horizontalFormLayout}>
        <Form.Item label="原文"><Typography.Text strong>{props.alias.rawName}</Typography.Text></Form.Item>
        <Form.Item label="出现次数"><Typography.Text>{props.alias.seenCount}</Typography.Text></Form.Item>
        <Form.Item label="关联到已有主体">
          <Select
            aria-label="关联到已有主体"
            value={props.partyId}
            options={[{ value: '', label: '新建' }, ...props.alias.similar.map((item) => ({ value: item.partyId, label: item.displayName }))]}
            onChange={(value) => props.onParty(value)}
          />
        </Form.Item>
        {props.partyId === '' ? (
          <Form.Item label="新建主体角色">
            <Flex gap={12} wrap>
              <Checkbox checked={props.roles.isSupplier} onChange={(event) => props.onRoles({ ...props.roles, isSupplier: event.target.checked })}>供应商</Checkbox>
              <Checkbox checked={props.roles.isFactory} onChange={(event) => props.onRoles({ ...props.roles, isFactory: event.target.checked })}>代工厂</Checkbox>
            </Flex>
          </Form.Item>
        ) : null}
        {isBlocked ? (
          <Alert
            type="warning"
            showIcon
            title="这两个名字在纪要和数据里没有被证明是同一家"
            action={<Button size="small" onClick={props.onConfirm}>确认仍要合并</Button>}
          />
        ) : null}
      </Form>
    </>
  );
}
