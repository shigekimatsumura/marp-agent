import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as agentcore from '@aws-cdk/aws-bedrock-agentcore-alpha';
import type { IUserPool, IUserPoolClient } from 'aws-cdk-lib/aws-cognito';

interface MarpAgentProps {
  stack: cdk.Stack;
  userPool?: IUserPool;
  userPoolClient?: IUserPoolClient;
}

export function createMarpAgent({ stack, userPool, userPoolClient }: MarpAgentProps) {
  // ローカルDockerイメージからビルド（ARM64）
  const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
    path.join(__dirname, 'runtime')
  );

  // 認証設定（本番のみCognito、ローカルはIAM）
  const authConfig = userPool && userPoolClient
    ? agentcore.RuntimeAuthorizerConfiguration.usingCognito(userPool, [userPoolClient])
    : undefined;

  // AgentCore Runtime作成
  const runtime = new agentcore.Runtime(stack, 'MarpAgentRuntime', {
    runtimeName: 'marp-agent',
    agentRuntimeArtifact,
    authorizerConfiguration: authConfig,
  });

  // Bedrockモデル呼び出し権限を付与（全モデル）
  runtime.addToRolePolicy(new iam.PolicyStatement({
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream',
    ],
    resources: ['arn:aws:bedrock:*::foundation-model/*'],
  }));

  // エンドポイント作成
  const endpoint = runtime.addEndpoint('marp-agent-endpoint');

  // 出力
  new cdk.CfnOutput(stack, 'MarpAgentRuntimeArn', {
    value: runtime.agentRuntimeArn,
    description: 'Marp Agent Runtime ARN',
  });

  new cdk.CfnOutput(stack, 'MarpAgentEndpointArn', {
    value: endpoint.agentRuntimeEndpointArn,
    description: 'Marp Agent Endpoint ARN',
  });

  return { runtime, endpoint };
}
