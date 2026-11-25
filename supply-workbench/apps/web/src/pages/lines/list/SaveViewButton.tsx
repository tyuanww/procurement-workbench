import { Button, Form, Input, Modal } from 'antd';
import { useId, useState } from 'react';

export function SaveViewButton({ isDisabled, onSave }: {
  readonly isDisabled: boolean;
  readonly onSave: (label: string) => boolean;
}) {
  const [isOpen, setOpen] = useState(false);
  const formId = useId();
  return <>
    <Button disabled={isDisabled} onClick={() => setOpen(true)}>保存当前视图</Button>
    <Modal open={isOpen} title="保存当前视图" okText="保存" cancelText="取消" destroyOnHidden
      onCancel={() => setOpen(false)} okButtonProps={{ htmlType: 'submit', form: formId }}>
      <Form<{ readonly label: string }> id={formId} name={formId} layout="vertical" preserve={false}
        onFinish={({ label }) => { if (onSave(label)) setOpen(false); }}>
        <Form.Item name="label" label="视图名称" rules={[{ required: true, whitespace: true, message: '请输入视图名称' }]}>
          <Input aria-label="视图名称" autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
