---
name: check-app-stats
description: このアプリの利用統計を確認（Cognitoユーザー数、AgentCore呼び出し回数、Bedrockコスト）。※Tavily APIの残量は /check-tavily-credits を使用
allowed-tools: Bash(aws:*)
---

# 環境利用状況チェック

各Amplify環境（main/kag）のCognitoユーザー数とBedrock AgentCoreランタイムのトレース数を調査する。

## 実行方法

**重要**: 以下のBashスクリプトを**そのまま1回で実行**すること。すべてのデータ取得を並列化し、1回の承認で完了する。

```bash
#!/bin/bash
set -e

REGION="us-east-1"
OUTPUT_DIR="/tmp/marp-stats"
mkdir -p "$OUTPUT_DIR"

echo "📊 Marp Agent 利用状況を取得中..."

# ========================================
# 1. リソースID取得（並列実行）
# ========================================
echo "🔍 リソースIDを取得中..."

# Cognito User Pool ID取得（marp-main, marp-kagで検索）
POOL_MAIN=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION \
  --query "UserPools[?contains(Name, 'marp-main')].Id" --output text)
POOL_KAG=$(aws cognito-idp list-user-pools --max-results 60 --region $REGION \
  --query "UserPools[?contains(Name, 'marp-kag')].Id" --output text)

# AgentCore ロググループ名取得
LOG_MAIN=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_main \
  --region $REGION --query "logGroups[0].logGroupName" --output text)
LOG_KAG=$(aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore/runtimes/marp_agent_kag \
  --region $REGION --query "logGroups[0].logGroupName" --output text)

# ========================================
# 2. Cognitoユーザー数取得
# ========================================
echo "👥 Cognitoユーザー数を取得中..."
USERS_MAIN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_MAIN" --region $REGION \
  --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")
USERS_KAG=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_KAG" --region $REGION \
  --query "UserPool.EstimatedNumberOfUsers" --output text 2>/dev/null || echo "0")

# ========================================
# 3. CloudWatch Logsクエリを並列開始
# ========================================
echo "📈 CloudWatch Logsクエリを並列開始..."
START_7D=$(date -v-7d +%s)
START_24H=$(date -v-24H +%s)
END_NOW=$(date +%s)

QUERY_FILTER='filter @message like /invocations/ or @message like /POST/ or @message like /invoke/'

# 日次クエリ開始（main/kag並列）
Q_DAILY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$QUERY_FILTER | stats count(*) as count by datefloor(@timestamp + 9h, 1d) as day_jst | sort day_jst asc" \
  --region $REGION --query 'queryId' --output text)

Q_DAILY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_7D --end-time $END_NOW \
  --query-string "$QUERY_FILTER | stats count(*) as count by datefloor(@timestamp + 9h, 1d) as day_jst | sort day_jst asc" \
  --region $REGION --query 'queryId' --output text)

# 時間別クエリ開始（main/kag並列）
Q_HOURLY_MAIN=$(aws logs start-query \
  --log-group-name "$LOG_MAIN" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$QUERY_FILTER | stats count(*) as count by datefloor(@timestamp + 9h, 1h) as hour_jst | sort hour_jst asc" \
  --region $REGION --query 'queryId' --output text)

Q_HOURLY_KAG=$(aws logs start-query \
  --log-group-name "$LOG_KAG" \
  --start-time $START_24H --end-time $END_NOW \
  --query-string "$QUERY_FILTER | stats count(*) as count by datefloor(@timestamp + 9h, 1h) as hour_jst | sort hour_jst asc" \
  --region $REGION --query 'queryId' --output text)

# ========================================
# 4. Bedrockコスト取得（クエリ待機中に並列実行）
# ========================================
echo "💰 Bedrockコストを取得中..."
aws ce get-cost-and-usage \
  --time-period Start=$(date -v-7d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE \
  --region $REGION \
  --output json > "$OUTPUT_DIR/cost.json"

# ========================================
# 5. クエリ結果取得（8秒待機後）
# ========================================
echo "⏳ クエリ完了を待機中..."
sleep 8

echo "📥 クエリ結果を取得中..."
aws logs get-query-results --query-id "$Q_DAILY_MAIN" --region $REGION > "$OUTPUT_DIR/daily_main.json"
aws logs get-query-results --query-id "$Q_DAILY_KAG" --region $REGION > "$OUTPUT_DIR/daily_kag.json"
aws logs get-query-results --query-id "$Q_HOURLY_MAIN" --region $REGION > "$OUTPUT_DIR/hourly_main.json"
aws logs get-query-results --query-id "$Q_HOURLY_KAG" --region $REGION > "$OUTPUT_DIR/hourly_kag.json"

# ========================================
# 6. 結果出力
# ========================================
echo ""
echo "=========================================="
echo "📊 MARP AGENT 利用状況レポート"
echo "=========================================="
echo ""

echo "👥 Cognitoユーザー数"
echo "  main: $USERS_MAIN 人"
echo "  kag:  $USERS_KAG 人"
echo "  合計: $((USERS_MAIN + USERS_KAG)) 人"
echo ""

echo "📈 日次invocation数（過去7日間・JST）"
echo "[main]"
jq -r '.results[] | "  \(.[] | select(.field == "day_jst") | .value | split(" ")[0]): \(.[] | select(.field == "count") | .value) 回"' "$OUTPUT_DIR/daily_main.json"
TOTAL_MAIN=$(jq '[.results[][] | select(.field == "count") | .value | tonumber] | add // 0' "$OUTPUT_DIR/daily_main.json")
echo "  合計: $TOTAL_MAIN 回"
echo ""
echo "[kag]"
jq -r '.results[] | "  \(.[] | select(.field == "day_jst") | .value | split(" ")[0]): \(.[] | select(.field == "count") | .value) 回"' "$OUTPUT_DIR/daily_kag.json"
TOTAL_KAG=$(jq '[.results[][] | select(.field == "count") | .value | tonumber] | add // 0' "$OUTPUT_DIR/daily_kag.json")
echo "  合計: $TOTAL_KAG 回"
echo ""

echo "⏰ 時間別invocation数（直近24時間・JST）"
echo ""
echo "        [main]                              [kag]"
echo "  時刻  |  グラフ              | 回数    |  グラフ              | 回数"
echo "  ------|----------------------|---------|----------------------|------"

# main/kagのデータをJSON オブジェクト（時刻→回数）として取得
MAIN_DATA=$(jq -r '[.results[] | {key: (.[] | select(.field == "hour_jst") | .value[11:13]), value: (.[] | select(.field == "count") | .value | tonumber)}] | from_entries' "$OUTPUT_DIR/hourly_main.json" 2>/dev/null || echo "{}")
KAG_DATA=$(jq -r '[.results[] | {key: (.[] | select(.field == "hour_jst") | .value[11:13]), value: (.[] | select(.field == "count") | .value | tonumber)}] | from_entries' "$OUTPUT_DIR/hourly_kag.json" 2>/dev/null || echo "{}")

# 現在時刻（JST）から24時間分を逆順で生成
CURRENT_HOUR=$(TZ=Asia/Tokyo date +%H)
for i in $(seq 23 -1 0); do
  HOUR=$(( (CURRENT_HOUR - i + 24) % 24 ))
  HOUR_STR=$(printf "%02d" $HOUR)

  # mainのカウント取得
  MAIN_COUNT=$(echo "$MAIN_DATA" | jq -r ".\"$HOUR_STR\" // 0")
  MAIN_BARS=$(( MAIN_COUNT / 2 ))
  [ $MAIN_BARS -gt 20 ] && MAIN_BARS=20
  if [ $MAIN_BARS -gt 0 ]; then
    MAIN_BAR=$(printf '█%.0s' $(seq 1 $MAIN_BARS))
  else
    MAIN_BAR=""
  fi

  # kagのカウント取得
  KAG_COUNT=$(echo "$KAG_DATA" | jq -r ".\"$HOUR_STR\" // 0")
  KAG_BARS=$(( KAG_COUNT / 2 ))
  [ $KAG_BARS -gt 20 ] && KAG_BARS=20
  if [ $KAG_BARS -gt 0 ]; then
    KAG_BAR=$(printf '█%.0s' $(seq 1 $KAG_BARS))
  else
    KAG_BAR=""
  fi

  printf "  %s:00 | %-20s | %3d     | %-20s | %3d\n" "$HOUR_STR" "$MAIN_BAR" "$MAIN_COUNT" "$KAG_BAR" "$KAG_COUNT"
done
echo ""

echo "💰 Bedrockコスト（過去7日間・日別）"
jq -r '
  .ResultsByTime[] |
  .TimePeriod.Start as $date |
  [.Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] |
  add // 0 |
  "  \($date): $\(. | . * 100 | floor / 100)"
' "$OUTPUT_DIR/cost.json"

TOTAL_COST=$(jq -r '
  [.ResultsByTime[].Groups[] | select(.Keys[0] | contains("Claude") or contains("Bedrock")) | .Metrics.UnblendedCost.Amount | tonumber] | add // 0
' "$OUTPUT_DIR/cost.json")
echo "  週間合計: \$$TOTAL_COST"
echo ""

echo "💵 Bedrockコスト（環境別内訳・推定）"
TOTAL_INV=$((TOTAL_MAIN + TOTAL_KAG))
if [ "$TOTAL_INV" -gt 0 ]; then
  MAIN_PCT=$((TOTAL_MAIN * 100 / TOTAL_INV))
  KAG_PCT=$((TOTAL_KAG * 100 / TOTAL_INV))
  MAIN_COST=$(printf "%.2f" $(echo "$TOTAL_COST * $TOTAL_MAIN / $TOTAL_INV" | bc -l))
  KAG_COST=$(printf "%.2f" $(echo "$TOTAL_COST * $TOTAL_KAG / $TOTAL_INV" | bc -l))
  MAIN_MONTHLY=$(printf "%.0f" $(echo "$MAIN_COST * 4" | bc -l))
  KAG_MONTHLY=$(printf "%.0f" $(echo "$KAG_COST * 4" | bc -l))
  TOTAL_WEEKLY=$(printf "%.2f" $(echo "$TOTAL_COST" | bc -l))
  TOTAL_MONTHLY=$(printf "%.0f" $(echo "$TOTAL_COST * 4" | bc -l))
  echo "  main: 週間 \$$MAIN_COST → 月間推定 \$$MAIN_MONTHLY ($MAIN_PCT%)"
  echo "  kag:  週間 \$$KAG_COST → 月間推定 \$$KAG_MONTHLY ($KAG_PCT%)"
  echo "  合計: 週間 \$$TOTAL_WEEKLY → 月間推定 \$$TOTAL_MONTHLY"
else
  echo "  invocation数が0のため計算できません"
fi
echo ""
echo "✅ 完了！"
```

## 出力フォーマット

スクリプト実行後、以下の情報が出力される：

1. **Cognitoユーザー数**: 環境ごとのユーザー数
2. **日次invocation数**: 過去7日間の日別回数（main/kag別）
3. **時間別invocation数**: 直近24時間の全時間帯（ASCIIバーグラフ）
4. **Bedrockコスト（日別）**: 過去7日間の日別コスト
5. **Bedrockコスト（環境別内訳）**: invocation数で按分した推定コスト（週間・月間）

## 注意事項

- AWS認証が切れている場合は `aws login` を先に実行すること
- CloudWatch Logsクエリは非同期のため8秒待機している（必要に応じて調整）
