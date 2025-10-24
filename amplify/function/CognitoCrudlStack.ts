// file: amplify/function/CognitoCrudlStack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ConstructFactory, ConstructFactoryGetInstanceProps, ResourceProvider } from '@aws-amplify/plugin-types';

export class CognitoCrudlStack implements ConstructFactory<cdk.Stack & ResourceProvider> {
  readonly name = 'CognitoCrudlStack';
  resource!: cdk.Stack & ResourceProvider;

  constructor(auth?: ConstructFactory<any>) {
    // Store auth for potential use
    this.auth = auth;
  }

  private auth?: ConstructFactory<any>;

  getInstance(props: ConstructFactoryGetInstanceProps & { scope?: Construct } = {} as any): cdk.Stack & ResourceProvider {
    const maybeScope = (props as any).scope ?? (props as any).construct ?? undefined;
    const scope: Construct = maybeScope ?? new cdk.App();
    const stackProps = (props as unknown) as cdk.StackProps;

    this.resource = new cdk.Stack(scope, this.name, stackProps) as cdk.Stack & ResourceProvider;
    (this.resource as any).resources = (this.resource as any).resources ?? {};

// Use auth's userPoolId if provided, else create a new User Pool
const userPoolId = (this.auth as any)?.resources?.cognitoUserPool?.userPoolId;

const userPool = userPoolId
  ? cognito.UserPool.fromUserPoolId(this.resource, 'ImportedUserPool', userPoolId)
  : new cognito.UserPool(this.resource, 'MyUserPool', {
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

    const crudlLambda = new lambda.Function(this.resource, 'CognitoCrudlLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('amplify/function/lambda'),
      environment: { USER_POOL_ID: userPool.userPoolId },
    });

    crudlLambda.addToRolePolicy(
      new iam.PolicyStatement({
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
          `arn:aws:cognito-idp:${cdk.Stack.of(this.resource).region}:${cdk.Stack.of(this.resource).account}:userpool/${userPool.userPoolId}`,
        ],
      })
    );

    const api = new apigateway.RestApi(this.resource, 'CognitoApi', {
      restApiName: 'Cognito CRUDL API',
      deployOptions: { stageName: 'prod' },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this.resource, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(crudlLambda, { proxy: true });

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

    (this.resource as any).resources['CognitoGroupAPI'] = {
      type: 'AWS::ApiGateway::RestApi',
      name: 'CognitoApi',
      identifier: api.restApiId,
      outputs: { endpoint: api.url },
    };

    new cdk.CfnOutput(this.resource, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this.resource, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this.resource, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });

    return this.resource;
  }
}