# パワポ作るマン（marp-agent）実装計画

## 概要

MarpでスライドをAI生成するWebアプリケーション。非エンジニアでもブラウザから指示を出して、スライドの作成・編集・プレビュー・PDFダウンロードができる。

## 命名規則

| 用途 | 名称 |
|------|------|
| アプリ名（表示用） | パワポ作るマン |
| リポジトリ名 | marp-agent |
| リソース名（AWS） | marp-agent / marp |
| 短縮表記 | marp |

## 開発方針

```
Phase 1: ローカル開発（認証なし）
├── エージェント単体テスト（Python）
├── フロントエンド開発（React）
└── ローカルでE2E動作確認

Phase 2: Amplifyデプロイ
├── Cognito認証を有効化（本番のみ）
├── AgentCore Runtimeデプロイ
└── 本番環境テスト
```

**ポイント**: Amplify sandbox は使わず、ローカル開発 → 本番デプロイの流れ

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        AWS Cloud                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │    Amplify      │    │         AgentCore Runtime           │ │
│  │  ┌───────────┐  │    │  ┌─────────────────────────────────┐│ │
│  │  │   React   │  │───▶│  │      Strands Agent             ││ │
│  │  │ Frontend  │  │SSE │  │  ┌─────────┐  ┌─────────────┐  ││ │
│  │  └───────────┘  │    │  │  │ Claude  │  │ Marp Tools  │  ││ │
│  │  ┌───────────┐  │    │  │  │ Sonnet  │  │ ・generate  │  ││ │
│  │  │  Cognito  │  │    │  │  └─────────┘  │ ・edit      │  ││ │
│  │  │   認証    │  │    │  │              │ ・preview   │  ││ │
│  │  └───────────┘  │    │  │              │ ・export    │  ││ │
│  └─────────────────┘    │  │              └─────────────────┘││ │
│                         │  └─────────────────────────────────┘│ │
│                         │                                     │ │
│                         │  ┌─────────────┐  ┌─────────────┐  │ │
│                         │  │     S3      │  │   Bedrock   │  │ │
│                         │  │ (スライド)  │  │   Claude    │  │ │
│                         │  └─────────────┘  └─────────────┘  │ │
│                         └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## 技術スタック

| レイヤー | 技術 | 用途 |
|---------|------|------|
| フロントエンド | React + TypeScript (Vite) | WebUI |
| AIエージェント | Strands Agents (Python) | スライド生成ロジック |
| LLM | Bedrock Claude Sonnet 4.5 | テキスト生成 |
| スライド変換 | Marp CLI | Markdown → PDF/HTML |
| 認証 | Amplify Auth (Cognito) | ユーザー認証 |
| インフラ | AWS CDK | IaC |
| ホスティング | Amplify Hosting | フロントエンド配信 |
| ランタイム | Bedrock AgentCore | エージェント実行基盤 |
| ストレージ | S3 | スライド・PDF保存 |

## CDK Hotswap & Amplify 対応状況（2025/1/24時点）

### 背景
k.gotoさんにより、CDK hotswapがAgentCore Runtimeに対応した。
- 参考: https://go-to-k.hatenablog.com/entry/cdk-hotswap-bedrock-agentcore-runtime

### 現状の制約

| 項目 | 状況 |
|------|------|
| CDK hotswap | AgentCore Runtime対応済み（v1.14.0〜） |
| Amplify toolkit-lib | まだ対応バージョン（1.14.0）に未更新 → **Amplify側のアップデート待ち** |
| ECRソースのバグ | AWS SDK（smithy/core）のリグレッション → **近々自動修正される見込み** |
| Amplify Console | Docker build未サポート |

### 採用方針

```
┌─────────────────────────────────────────────────────────────┐
│  開発環境（sandbox）                                          │
│  ・AgentRuntimeArtifact.fromAsset でローカルARM64ビルド       │
│  ・deploy-time-build は使わない（macでARMビルド可能なため）     │
│  ・Amplifyのhotswap対応後は高速デプロイが可能に                │
├─────────────────────────────────────────────────────────────┤
│  本番環境（Amplify Console）                                   │
│  ・Docker build未サポートのため工夫が必要                      │
│  ・選択肢:                                                     │
│    1. GitHub ActionsでECRプッシュ → CDKでECR参照               │
│    2. sandboxとmainでビルド方法を分岐                         │
│    3. Amplify ConsoleのDocker対応を待つ                       │
└─────────────────────────────────────────────────────────────┘
```

### 今後の対応
1. まずはsandbox環境で `fromAsset` を使って開発
2. Amplify/CDKのアップデートを追跡
3. 本番デプロイ方法は後で決定（GitHub Actions or 分岐ロジック）

## 機能一覧

### MVP（Phase 1）
- [ ] ユーザー認証（Cognito）
- [ ] チャットUI（指示入力）
- [ ] スライド生成（Marp Markdown）
- [ ] リアルタイムプレビュー
- [ ] PDFダウンロード

### 追加機能（Phase 2）
- [ ] スライド編集（マークダウンエディタ）
- [ ] テーマ選択
- [ ] 画像アップロード・挿入
- [ ] スライド履歴管理

## ドキュメント構成

開発開始時に `/docs` 配下へ移動：
```
docs/
├── PLAN.md       # 実装計画
├── SPEC.md       # 仕様書
└── KNOWLEDGE.md  # ナレッジベース（随時更新）
```

---

## ディレクトリ構成

```
marp-agent/
├── docs/                        # ドキュメント
├── amplify/
│   ├── auth/
│   │   └── resource.ts          # Cognito認証設定
│   ├── agent/
│   │   ├── resource.ts          # AgentCore CDK定義
│   │   └── runtime/
│   │       ├── Dockerfile       # エージェントコンテナ
│   │       ├── requirements.txt
│   │       └── agent.py         # Strands Agent実装
│   ├── storage/
│   │   └── resource.ts          # S3バケット設定
│   └── backend.ts               # バックエンド統合
├── src/
│   ├── App.tsx                  # メインアプリ
│   ├── components/
│   │   ├── Chat.tsx             # チャットUI
│   │   ├── SlidePreview.tsx     # スライドプレビュー
│   │   └── SlideEditor.tsx      # マークダウンエディタ
│   └── hooks/
│       └── useAgent.ts          # エージェント通信
├── package.json
├── vite.config.ts
├── tsconfig.json
└── PLAN.md
```

## Strands Agent 設計

### システムプロンプト

```
あなたはスライド作成のプロフェッショナルです。
ユーザーの指示に基づいて、Marp形式のマークダウンでスライドを作成します。

ルール：
- スライド区切りは `---` を使用
- 最初のスライドにはタイトルと副題を入れる
- 箇条書きは簡潔に
- 必要に応じて絵文字を活用
- marp: true をフロントマターに含める
```

### ツール定義

| ツール名 | 機能 | 入力 | 出力 |
|---------|------|------|------|
| `generate_slide` | 新規スライド生成 | プロンプト | Marp Markdown |
| `edit_slide` | スライド編集 | 編集指示, 現在のMarkdown | 更新後Markdown |
| `preview_slide` | HTMLプレビュー生成 | Markdown | HTML文字列 |
| `export_pdf` | PDF出力 | Markdown | S3 URL (PDF) |

## 実装ステップ

### Step 1: プロジェクト初期化
1. Amplify Gen2プロジェクト作成
2. 認証設定（Cognito）
3. 基本的なReact UI

### Step 2: エージェント実装
1. Strands Agent 作成（agent.py）
2. Marp CLI をDockerfileに追加
3. ツール実装（generate, edit, preview, export）

### Step 3: インフラ構築
1. AgentCore Runtime CDK定義
2. S3バケット設定
3. IAMロール・権限設定

### Step 4: フロントエンド実装
1. チャットUI
2. SSEストリーミング対応
3. スライドプレビューコンポーネント
4. PDFダウンロード機能

### Step 5: 統合・テスト
1. ローカル開発環境（ampx sandbox）
2. E2Eテスト
3. 本番デプロイ

## 検討事項・質問

### 要確認
1. **認証**: 認証は必須？それともパブリックアクセスOK？
2. **保存**: スライドはユーザーごとに保存する？一時的でOK？
3. **テーマ**: Marpのデフォルトテーマのみ？カスタムテーマ対応？
4. **同時編集**: 複数人での共同編集は必要？

### 技術的な検討
1. **Marp CLI実行**: AgentCoreコンテナ内でMarp CLIを実行
   - Node.js + @marp-team/marp-cli をインストール
   - Puppeteer/Chromiumが必要（PDF出力用）
2. **ファイルサイズ**: PDF出力のサイズ上限
3. **タイムアウト**: スライド生成の時間制限

## 参考リンク

- [Marp公式ドキュメント](https://marp.app/)
- [Strands Agents](https://github.com/strands-agents/strands-agents)
- [Amplify Gen2](https://docs.amplify.aws/gen2/)
- [Bedrock AgentCore](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-agentcore.html)
- [参考実装: Amplify × AgentCore](https://qiita.com/minorun365/items/0b4a980f2f4bb073a9e0)
- [CDK Hotswap × AgentCore Runtime](https://go-to-k.hatenablog.com/entry/cdk-hotswap-bedrock-agentcore-runtime)
