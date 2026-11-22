import { useEffect, useState, type ReactNode } from 'react';
import { Button, Form, Input, Select, Space, Typography, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { UserViewSchema, type ProductOverview, type UserView } from '@sw/contracts';
import { imageSlotLabel } from '@sw/domain';
import { apiGet, asArray } from '../../shared/api/client.js';
import { horizontalFormLayout } from '../../shared/ui/form.js';
import {
  hideImage,
  saveContact,
  saveSku,
  unhideImage,
  uploadImage,
  type ProductEditMutationState,
} from './product-edit-actions.js';

export type MaintainProps = ProductEditMutationState & {
  readonly overview: ProductOverview;
  readonly edited: boolean;
};

export function EditSection(input: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
        {input.title}
      </Typography.Title>
      {input.children}
    </section>
  );
}

export function NameEditor({ input }: { readonly input: MaintainProps }) {
  const [sku, setSku] = useState(input.overview.product.skuName.value ?? '');
  const [previous, setPrevious] = useState<string | null>(null);
  return (
    <NameForm
      input={input}
      sku={sku}
      previous={previous}
      setPrevious={setPrevious}
      setSku={setSku}
    />
  );
}

function NameForm(input: {
  readonly input: MaintainProps;
  readonly sku: string;
  readonly previous: string | null;
  readonly setPrevious: (value: string | null) => void;
  readonly setSku: (value: string) => void;
}) {
  return (
    <Form
      {...horizontalFormLayout}
      onFinish={() => {
        void saveSku({
          input: input.input,
          sku: input.sku,
          undoTo: input.input.overview.product.skuName.value ?? '',
          setPrevious: input.setPrevious,
          setSku: input.setSku,
        });
      }}
    >
      <Form.Item label="SKU 名称">
        <Input
          value={input.sku}
          onChange={(event) => input.setSku(event.target.value)}
          aria-label="SKU 名称"
          style={{ width: '100%' }}
        />
      </Form.Item>
      <NameActions
        input={input.input}
        previous={input.previous}
        setPrevious={input.setPrevious}
        setSku={input.setSku}
      />
    </Form>
  );
}

function NameActions(input: {
  readonly input: MaintainProps;
  readonly previous: string | null;
  readonly setPrevious: (value: string | null) => void;
  readonly setSku: (value: string) => void;
}) {
  return (
    <Form.Item label=" " colon={false}>
      <Space>
        <Button type="primary" htmlType="submit">
          保存名称
        </Button>
        {input.previous === null ? null : (
          <Button
            onClick={() => {
              void saveSku({
                input: input.input,
                sku: input.previous ?? '',
                undoTo: null,
                setPrevious: input.setPrevious,
                setSku: input.setSku,
              });
            }}
          >
            撤销
          </Button>
        )}
      </Space>
    </Form.Item>
  );
}

export function ImageEditor({ input }: { readonly input: MaintainProps }) {
  const [reason, setReason] = useState('');
  return (
    <>
      <UploadImage input={input} />
      <VisibleImages input={input} reason={reason} setReason={setReason} />
      <HiddenImages input={input} />
    </>
  );
}

function UploadImage({ input }: { readonly input: MaintainProps }) {
  return (
    <Upload.Dragger
      accept="image/*"
      maxCount={1}
      showUploadList={false}
      beforeUpload={(file) => {
        void uploadImage({
          id: input.id,
          file,
          setOverview: input.setOverview,
          setMessage: input.setMessage,
        });
        return false;
      }}
      style={{ marginTop: 12 }}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">拖入或点击上传产品图片</p>
    </Upload.Dragger>
  );
}

function VisibleImages(input: {
  readonly input: MaintainProps;
  readonly reason: string;
  readonly setReason: (value: string) => void;
}) {
  return (
    <>
      {input.input.overview.images
        .filter((image) => !image.hidden)
        .map((image) => (
          <Space key={image.id} wrap style={{ marginTop: 8 }}>
            <Input
              value={input.reason}
              onChange={(event) => input.setReason(event.target.value)}
              placeholder="隐藏原因"
              style={{ width: 200 }}
            />
            <Button
              onClick={() => {
                void hideImage({
                  id: input.input.id,
                  imageId: image.id,
                  reason: input.reason,
                  setOverview: input.input.setOverview,
                  setMessage: input.input.setMessage,
                });
              }}
            >
              隐藏
            </Button>
          </Space>
        ))}
    </>
  );
}

function HiddenImages({ input }: { readonly input: MaintainProps }) {
  return (
    <>
      {input.overview.images
        .filter((image) => image.hidden)
        .map((image) => (
          <Button
            key={image.id}
            onClick={() => {
              void unhideImage({
                id: input.id,
                imageId: image.id,
                setOverview: input.setOverview,
                setMessage: input.setMessage,
              });
            }}
          >
            恢复 {imageSlotLabel(image.slot)}
          </Button>
        ))}
    </>
  );
}

export function ContactEditor({ input }: { readonly input: MaintainProps }) {
  const [nameRaw, setNameRaw] = useState('');
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState<readonly UserView[]>([]);
  useEffect(() => {
    void apiGet('/api/v1/users', asArray(UserViewSchema))
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);
  return (
    <ContactForm
      input={input}
      users={users}
      nameRaw={nameRaw}
      userId={userId}
      setNameRaw={setNameRaw}
      setUserId={setUserId}
    />
  );
}

function ContactForm(input: {
  readonly input: MaintainProps;
  readonly users: readonly UserView[];
  readonly nameRaw: string;
  readonly userId: string;
  readonly setNameRaw: (value: string) => void;
  readonly setUserId: (value: string) => void;
}) {
  return (
    <Form
      {...horizontalFormLayout}
      onFinish={() => {
        void saveContact({
          id: input.input.id,
          userId: input.userId,
          nameRaw: input.nameRaw,
          setOverview: input.input.setOverview,
          setMessage: input.input.setMessage,
        });
      }}
    >
      <ContactFields
        users={input.users}
        userId={input.userId}
        nameRaw={input.nameRaw}
        setUserId={input.setUserId}
        setNameRaw={input.setNameRaw}
      />
      <Form.Item label=" " colon={false}>
        <Button type="primary" htmlType="submit">
          保存联系人
        </Button>
      </Form.Item>
    </Form>
  );
}

function ContactFields(input: {
  readonly users: readonly UserView[];
  readonly userId: string;
  readonly nameRaw: string;
  readonly setUserId: (value: string) => void;
  readonly setNameRaw: (value: string) => void;
}) {
  return (
    <>
      <Form.Item label="用户">
        <Select
          aria-label="联系人用户"
          style={{ width: '100%' }}
          value={input.userId}
          options={[
            { value: '', label: '不选用户' },
            ...input.users.map((user) => ({ value: user.id, label: user.name })),
          ]}
          onChange={input.setUserId}
        />
      </Form.Item>
      <Form.Item label="名字">
        <Input
          value={input.nameRaw}
          onChange={(event) => input.setNameRaw(event.target.value)}
          placeholder="名字"
          style={{ width: '100%' }}
        />
      </Form.Item>
    </>
  );
}
