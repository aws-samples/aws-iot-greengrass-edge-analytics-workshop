import cfn = require("@aws-cdk/aws-cloudformation");
import lambda = require("@aws-cdk/aws-lambda");
import cdk = require("@aws-cdk/core");
import iam = require("@aws-cdk/aws-iam");

import fs = require("fs");
import path = require("path");

export interface CustomGreengrassServiceRoleResourceProps {
  account: string;
  stackName: string;
  roleArn: string;
}

export class CustomGreengrassServiceRoleResource extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: CustomGreengrassServiceRoleResourceProps
  ) {
    super(scope, id);

    const custom_resource_lambda_role = new iam.Role(
      this,
      "CustomGreengrassServiceResourceLambdaRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
      }
    );

    custom_resource_lambda_role.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: ["lambda:InvokeFunction"]
      })
    );

    custom_resource_lambda_role.addToPolicy(
      new iam.PolicyStatement({
        resources: ["arn:aws:logs:*:*:*"],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
      })
    );

    custom_resource_lambda_role.addToPolicy(
      new iam.PolicyStatement({
        resources: ["*"],
        actions: ["greengrass:*"]
      })
    );

    custom_resource_lambda_role.addToPolicy(
      new iam.PolicyStatement({
        resources: [props.roleArn],
        actions: [
          "iam:CreateRole",
          "iam:AttachRolePolicy",
          "iam:GetRole",
          "iam:DeleteRole",
          "iam:PassRole"
        ]
      })
    );

    const custom_greengrass_service_role_resource = new cfn.CustomResource(
      this,
      "CustomGreengrassServiceRoleResource",
      {
        provider: cfn.CustomResourceProvider.lambda(
          new lambda.SingletonFunction(this, "Singleton", {
            uuid: "b8d4f730-4ee1-11e8-9c2a-fa7ae01bbeba",
            // functionName: "CustomGreengrassServiceRoleFunction",
            code: lambda.Code.fromAsset(
              path.join(__dirname, "greengrass-service-role-handler")
            ),
            handler: "greengrass-service-role-lambda.handler",
            timeout: cdk.Duration.seconds(30),
            runtime: lambda.Runtime.PYTHON_3_6,
            role: custom_resource_lambda_role
          })
        ),
        properties: props
      }
    );
  }
}
