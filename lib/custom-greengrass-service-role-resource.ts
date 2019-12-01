/*
Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

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
