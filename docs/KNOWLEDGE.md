# ナレッジベース

開発中に得られた知見・調査結果をここに蓄積していく。

---

## 使用ライブラリ・SDK

**方針**: すべて最新版を使用する

### フロントエンド
- React
- TypeScript
- Vite
- Tailwind CSS

### AWS Amplify
- @aws-amplify/backend
- @aws-amplify/ui-react

### エージェント・インフラ
- strands-agents（Python >=3.10）
- @marp-team/marp-cli
- @aws-cdk/aws-bedrock-alpha

---

## CDK Hotswap × AgentCore Runtime

### 概要
- 2025/1/24、CDK hotswap が Bedrock AgentCore Runtime に対応
- k.goto さん（@365_step_tech）による実装・調査

### 参考リンク
- [CDK Hotswap × AgentCore Runtime](https://go-to-k.hatenablog.com/entry/cdk-hotswap-bedrock-agentcore-runtime)

### 対応状況（2025/1/24時点）

| 項目 | 状況 |
|------|------|
| CDK hotswap | AgentCore Runtime 対応済み（v1.14.0〜） |
| Amplify toolkit-lib | まだ対応バージョン（1.14.0）に未更新 |
| ECRソースのバグ | AWS SDK（smithy/core）のリグレッション。近々自動修正見込み |
| Amplify Console | Docker build 未サポート |

### Amplify との組み合わせ

#### sandbox 環境
- `AgentRuntimeArtifact.fromAsset` でローカルビルド可能
- Mac ARM64 でビルドできるなら `deploy-time-build` は不要
- Amplify の toolkit-lib 更新後は hotswap も使える

#### 本番環境（Amplify Console）
- Docker build 未サポートのため工夫が必要
- 選択肢：
  1. GitHub Actions で ECR プッシュ → CDK で ECR 参照
  2. sandbox と main でビルド方法を分岐
  3. Amplify Console の Docker 対応を待つ

### 関連バグ
- ECR ソースで `DescribeImages` が `ImageNotFoundException` になる問題
  - 原因: AWS SDK（smithy/core）の特定バージョンのリグレッション
  - CDK/Amplify/SDK のリポジトリ横断で調査された
  - 依存バージョン更新で自動修正される見込み

---

## Marp CLI

### 基本情報
- Markdown からスライドを生成するツール
- PDF / HTML / PPTX 出力対応
- 公式: https://marp.app/

### インストール
```bash
npm install -g @marp-team/marp-cli
```

### PDF 出力の依存
- Puppeteer / Chromium が必要
- Docker では別途 Chromium インストールが必要

```dockerfile
# 例
RUN apt-get update && apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Marp フロントマター
```yaml
---
marp: true
theme: gaia       # default, gaia, uncover
size: 16:9        # 4:3 も可能
paginate: true    # ページ番号表示
---
```

### スライド区切り
```markdown
---
```
（3つのハイフン）

---

## Strands Agents

### 基本情報
- AWS が提供する AI エージェントフレームワーク
- Python で実装
- Bedrock モデルと統合

### ストリーミング
```python
async for event in agent.stream_async(prompt):
    # event を処理
```

### AgentCore Runtime との統合
- コンテナ化してデプロイ
- Cognito 認証との統合が可能

---

## Amplify Gen2

### カスタムリソースの追加
```typescript
// amplify/backend.ts
import { defineBackend } from '@aws-amplify/backend';
import { myCustomStack } from './custom/resource';

const backend = defineBackend({
  auth,
  // ...
});

// カスタムスタックを追加
backend.createStack('MyCustomStack');
```

### 認証（Cognito）
```typescript
// amplify/auth/resource.ts
import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
});
```

### 環境変数での分岐
```typescript
// フロントエンド
const isProduction = import.meta.env.PROD;
```

---

## 今後追加予定のナレッジ

- [ ] AgentCore Runtime の詳細設定
- [ ] SSE (Server-Sent Events) の実装パターン
- [ ] Tailwind CSS のベストプラクティス
- [ ] Marp のカスタムテーマ作成方法
