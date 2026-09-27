# Slack Ops Bot — 勤怠・業務報告を自動化する Slack ボット

[한국어](README.md) | **日本語**

> チームで毎日くり返される勤怠確認と進捗報告を、2種類の Slack ボットで自動化します。
> ポートフォリオ兼学習用のプロジェクトであり、**企画 → 設計 → 開発 → コードレビュー → QA → デプロイ**
> という実務のサイクルを一周することを目的としています。

## なぜこのテーマなのか

ドメインロジック自体は単純です。スプレッドシートを読み、テキストを要約し、Slack に送るだけです。
その代わり、**異なる外部 API(Slack / Google Sheets / Claude)の連携、失敗時の処理、
スケジューリング**に重点を置いています。

> 外部 API がひとつ絡むだけでも、「正常なレスポンス」だけを処理していては不十分です。
> 3つの外部サービスをつなぐ中で、それぞれの失敗をどう扱うか。
> そこを自分の言葉で説明できることが、このプロジェクトの目標です。

## 機能範囲

### ボット A — 出勤確認ボット

| 機能 | 説明 | 優先度 |
|---|---|---|
| シート参照 | Google Sheets から当日の勤務予定者(部署・状態・勤務時間)を読み取る | P0 |
| メンション送信 | 部署ごとのチャンネルに当日の勤務者をメンションで通知する | P0 |
| 定時実行 | 平日 8:50(Asia/Seoul)に自動実行する | P0 |
| 出勤確認 | 対象者がメンションのスレッドに返信するとリアクションで確認を示す | P0 |
| 失敗通知 | シート参照の失敗・該当者なし・送信失敗を区別して対応する | P1 |

### ボット B — 進捗ダイジェストボット

| 機能 | 説明 | 優先度 |
|---|---|---|
| 進捗報告の収集 | メンバーが自由記述で書いた進捗報告を受け取る | P0 |
| LLM による要約 | 収集したテキストを Claude API で要約する | P0 |
| ダイジェスト送信 | 要約をマネージャー向けに整形して届ける | P0 |
| 失敗時の処理 | 未提出者の明示、LLM 呼び出し失敗時は原文をそのまま送信 | P1 |

**どちらのボットも P0 まで完成すれば、成立するプロジェクトです。**

## 現在の進捗

開発中のプロジェクトです。実際に動作する範囲は以下のとおりです。

| 状態 | 項目 |
|---|---|
| ✅ | 企画・設計ドキュメント(要件定義、アーキテクチャ、ADR、QA 方針) |
| ✅ | Slack アプリ構成(Socket Mode、マニフェストをリポジトリ内でコードとして管理) |
| ✅ | Bolt アプリの起動、環境変数の検証(fail fast)、`/report` コマンドへの応答 |
| 🚧 | ボット A — Google Sheets 連携、勤務対象者の抽出、メンション送信、スケジューリング |
| 🚧 | ボット B — 報告入力モーダル、Claude による要約、失敗時の原文フォールバック |
| 🚧 | テスト、CI、デプロイ |

機能一覧を「予定」ではなく、**実際に動作しているかどうか**で分けて記載しています。

## 技術スタック

| 領域 | 技術 |
|---|---|
| 言語 / ランタイム | TypeScript, Node.js |
| Slack 連携 | Slack Bolt SDK |
| 勤怠データ | Google Sheets API |
| 要約 | Claude API (Anthropic SDK) |
| スケジューリング | node-cron(Bolt と同一プロセス。Socket Mode のため別サーバー不要) |
| 品質 | ESLint, Prettier |
| CI/CD | GitHub Actions |

構成と各ボットの動作の詳細は [ARCHITECTURE.md](docs/ARCHITECTURE.md)、
技術選定の理由は [DECISIONS.md](docs/DECISIONS.md) に記録しています。

### 設計上の判断の例

- **Socket Mode を採用** — 公開 URL を用意せずに Slack と通信できるため、ローカル開発でも
  デプロイ後でも同じ構成で動きます。
- **データベースを持たない** — Google Sheets を唯一の情報源(source of truth)とします。
  入力 UI も兼ねており、この規模でストレージを増やす利点が小さいためです。
- **要約に失敗しても報告は必ず届ける** — Claude API がタイムアウトやレート制限で失敗した場合は、
  整形済みの原文をそのまま送信します。自動化のために情報が失われてはいけない、という方針です。
- **起動時に環境変数を検証して即座に終了する(fail fast)** — 実際の API 呼び出し時に
  `undefined` が露見すると、原因の特定が難しくなるためです。

## 動かし方

```powershell
git clone https://github.com/Nu-gu-nya/slack-ops-bot.git
cd slack-ops-bot
npm install
Copy-Item .env.example .env   # 取得したトークンを記入する
npm run dev
```

`⚡ Ops Bot 실행 중 (Socket Mode)` と表示されたら、ボットを招待したチャンネルで
`/report` を実行して動作を確認できます。

Slack アプリは [`slack-app-manifest.yml`](slack-app-manifest.yml) を
https://api.slack.com/apps の **Create New App → From a manifest** に貼り付けて作成します。
必要なスコープとイベント購読はこのファイルに記述されています。

| コマンド | 用途 |
|---|---|
| `npm run dev` | 開発実行(`.env` を読み込み Socket Mode で接続) |
| `npm run typecheck` | 型チェック |
| `npm run build && npm start` | ビルド後に実行 |

環境変数は `.env.example` を参照してください。各値の意味は
[ARCHITECTURE.md](docs/ARCHITECTURE.md) にまとめています。

## ドキュメント

進行順に読めるよう構成しています。

| 段階 | ドキュメント | 内容 |
|---|---|---|
| 0 | [ROADMAP.md](docs/ROADMAP.md) | スケジュールと日次目標 |
| 1 | [PLANNING.md](docs/PLANNING.md) | 要件定義、ユーザーストーリー、受け入れ条件 |
| 2 | [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 構成、データフロー、API 設計 |
| 3 | [CONTRIBUTING.md](CONTRIBUTING.md) | ブランチ・コミット・PR・レビューの規約 |
| 4 | [QA.md](docs/QA.md) | テスト方針とチェックリスト |
| 5 | [DEPLOY.md](docs/DEPLOY.md) | CI/CD、デプロイ、通知 |
| — | [TEAM.md](docs/TEAM.md) | 一人でチーム開発のプロセスを回す方法 |
| — | [DECISIONS.md](docs/DECISIONS.md) | 技術選定の記録(ADR) |
| — | [JOURNAL.md](docs/JOURNAL.md) | 開発日誌 — 詰まった点と学んだ点の記録 |

> このプロジェクトに Web 画面はありません。[UIUX.md](docs/UIUX.md) では画面の UX ではなく、
> 「ボットのメッセージと対話の UX」を扱っています。

## ドキュメントは韓国語です

本文のドキュメント(`docs/`)は韓国語で書かれています。
内容についてのご質問には日本語で対応できます。
