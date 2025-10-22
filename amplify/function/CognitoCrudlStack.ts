import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ConstructFactory, ConstructFactoryGetInstanceProps, ResourceProvider } from '@aws-amplify/plugin-types';

/**
 * CognitoCrudlStack
 * - Implements a ConstructFactory-compatible stack for Amplify backend.ts usage.
 * - Defensive: accepts props that may or may not include a `scope` property.
 *
 * Notes:
 * - We intentionally cast some things to `any` where Amplify's plugin types don't perfectly match CDK's StackProps.
 * - The Amplify backend expects `resource.resources` entries; we add 'CognitoGroupAPI' there.
 */
export class CognitoCrudlStack implements ConstructFactory<cdk.Stack & ResourceProvider> {
  readonly name = 'CognitoCrudlStack';
  // not readonly so we can assign in getInstance
  resource!: cdk.Stack & ResourceProvider;

  constructor() {}

  /**
   * Amplify may pass a props object that contains a `scope` or may not.
   * We attempt to pull a Construct scope from props; if absent we create a temporary App -> Stack scope.
   */
  getInstance(props: ConstructFactoryGetInstanceProps & { scope?: Construct } = {} as any): cdk.Stack & ResourceProvider {
    // try to find an Amplify-provided scope falling back to a local app (safe, but not ideal for synthesis outside Amplify)
    const maybeScope = (props as any).scope ?? (props as any).construct ?? undefined;
    const scope: Construct = maybeScope ?? new cdk.App(); // if Amplify didn't provide scope, create an App (fallback)

    // cast props into StackProps as best-effort; Amplify's shape differs from cdk.StackProps
    const stackProps = (props as unknown) as cdk.StackProps;

    // create the stack
    this.resource = new cdk.Stack(scope, this.name, stackProps) as cdk.Stack & ResourceProvider;

    // ensure resources bag exists on the resource (Amplify expects this)
    (this.resource as any).resources = (this.resource as any).resources ?? {};

    // --- Cognito resources ---
    const userPool = new cognito.UserPool(this.resource, 'MyUserPool', {
      userPoolName: 'my-app-pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(this.resource, 'AppClient', {
      userPool,
      authFlows: { userSrp: true },
    });

    // Lambda for CRUDL operations against Cognito
    const crudlLambda = new lambda.Function(this.resource, 'CognitoCrudlLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('amplify/function/lambda'),
      environment: { USER_POOL_ID: userPool.userPoolId },
    });

    // Minimal IAM policy for Cognito group operations
    crudlLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:CreateGroup',
        'cognito-idp:ListGroups',
        'cognito-idp:GetGroup',
        'cognito-idp:UpdateGroup',
        'cognito-idp:DeleteGroup',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:ListUsersInGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:ListUsers',
      ],
      resources: [
        // user pool ARN
        `arn:aws:cognito-idp:${cdk.Stack.of(this.resource).region}:${cdk.Stack.of(this.resource).account}:userpool/${userPool.userPoolId}`,
      ],
    }));

    // API Gateway REST API wired to the Lambda
    const api = new apigateway.RestApi(this.resource, 'CognitoApi', {
      restApiName: 'Cognito CRUDL API',
      deployOptions: {
        stageName: 'prod',
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this.resource, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(crudlLambda, {
      proxy: true,
    });

    const groupsResource = api.root.addResource('groups');
    groupsResource.addMethod('GET', lambdaIntegration, { authorizer });
    groupsResource.addMethod('POST', lambdaIntegration, { authorizer });

    const groupResource = groupsResource.addResource('{groupName}');
    groupResource.addMethod('GET', lambdaIntegration, { authorizer });
    groupResource.addMethod('PUT', lambdaIntegration, { authorizer });
    groupResource.addMethod('DELETE', lambdaIntegration, { authorizer });

    const groupUsersResource = groupsResource.addResource('{groupName}').addResource('users');
    groupUsersResource.addMethod('GET', lambdaIntegration, { authorizer });
    groupUsersResource.addMethod('POST', lambdaIntegration, { authorizer });

    const specificUser = groupUsersResource.addResource('{username}');
    specificUser.addMethod('DELETE', lambdaIntegration, { authorizer });

    // Publish an entry into resource.resources that Amplify expects (identifier + outputs)
    (this.resource as any).resources['CognitoGroupAPI'] = {
      type: 'AWS::ApiGateway::RestApi',
      name: 'CognitoApi',
      identifier: api.restApiId,
      outputs: {
        endpoint: api.url,
      },
    };

    // CloudFormation outputs for convenience
    new cdk.CfnOutput(this.resource, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this.resource, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this.resource, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });

    return this.resource;
  }
}
