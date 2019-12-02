import cdk = require("@aws-cdk/core");
import iot = require("@aws-cdk/aws-iot");
import ec2 = require("@aws-cdk/aws-ec2");
import greengrass = require("@aws-cdk/aws-greengrass");
import lambda = require("@aws-cdk/aws-lambda");
import iam = require("@aws-cdk/aws-iam");
import { Guid } from "guid-typescript";
import { CustomCertificateResource } from "./custom-certificate-resource";
import { CustomGreengrassServiceRoleResource } from "./custom-greengrass-service-role-resource";

import fs = require("fs");
import path = require("path");

export class EdgeAnalyticsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const greengrass_service_role = new iam.Role(
      this,
      "GreengrassServiceRole",
      {
        roleName: "Greengrass_ServiceRole",
        assumedBy: new iam.ServicePrincipal("greengrass.amazonaws.com")
      }
    );

    greengrass_service_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSGreengrassResourceAccessRolePolicy"
      )
    );

    greengrass_service_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess")
    );

    const custom_greengrass_service_role_modifier = new CustomGreengrassServiceRoleResource(
      this,
      "CustomGreengrassServiceRoleModifier",
      {
        roleArn: greengrass_service_role.roleArn,
        account: this.account,
        stackName: this.stackName
      }
    );

    /**
     * Create Greengrass Core Thing.
     */

    const core = new iot.CfnThing(this, "Core", {
      thingName: "Greengrass-Core"
    });

    const core_definition = new greengrass.CfnCoreDefinition(
      this,
      "CoreDefinition",
      { name: `${core.thingName}-Definition` }
    );

    const core_credentials = new CustomCertificateResource(
      this,
      "CoreCredentials",
      {
        account: this.account,
        stackName: this.stackName,
        thingName: core.thingName!
      }
    );

    const core_definition_version = new greengrass.CfnCoreDefinitionVersion(
      this,
      "CoreDefinitionVersion",
      {
        coreDefinitionId: core_definition.ref,
        cores: [
          {
            id: core.ref,
            thingArn: `arn:aws:iot:${this.region}:${this.account}:thing/${core.thingName}`,
            certificateArn: core_credentials.certificateArn
          }
        ]
      }
    );

    const core_policy = new iot.CfnPolicy(this, "CorePolicy", {
      policyName: `${core.thingName}_Policy`,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: "iot:*",
            Resource: "*"
          },
          {
            Effect: "Allow",
            Action: "greengrass:*",
            Resource: "*"
          }
        ]
      }
    });

    const core_policy_principal_attachment = new iot.CfnPolicyPrincipalAttachment(
      this,
      "CorePolicyPrincipalAttachment",
      {
        principal: core_credentials.certificateArn,
        policyName: core_policy.ref
      }
    );

    const core_principal_attachment = new iot.CfnThingPrincipalAttachment(
      this,
      "CorePrincipalAttachment",
      { principal: core_credentials.certificateArn, thingName: core.ref }
    );

    core.addDependsOn(core_policy_principal_attachment);
    core_principal_attachment.addDependsOn(core);

    /**
     * Create Greengrass Device.
     * In this case node-red will emulate an IoT Thing.
     */

    const device = new iot.CfnThing(this, "IoTDevice", {
      thingName: "Node-Red-Thing"
    });

    const device_definition = new greengrass.CfnDeviceDefinition(
      this,
      "DeviceDefinition",
      { name: `${device.thingName}-Definition` }
    );

    const device_credentials = new CustomCertificateResource(
      this,
      "DeviceCredentials",
      {
        account: this.account,
        stackName: this.stackName,
        thingName: device.thingName!
      }
    );

    const device_definition_version = new greengrass.CfnDeviceDefinitionVersion(
      this,
      "DeviceDefinitionVersion",
      {
        deviceDefinitionId: device_definition.ref,
        devices: [
          {
            id: device.ref,
            certificateArn: device_credentials.certificateArn,
            thingArn: `arn:aws:iot:${this.region}:${this.account}:thing/${device.thingName}`,
            syncShadow: false
          }
        ]
      }
    );

    const device_policy = new iot.CfnPolicy(this, "DevicePolicy", {
      policyName: "GreengrassGroupDevicePolicy",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["iot:Connect", "iot:Publish", "greengrass:Discover"],
            Resource: ["*"]
          }
        ]
      }
    });

    const device_policy_principal_attachment = new iot.CfnPolicyPrincipalAttachment(
      this,
      "DevicePolicyPrincipalAttachment",
      {
        policyName: device_policy.ref,
        principal: device_credentials.certificateArn
      }
    );

    const device_principal_attachment = new iot.CfnThingPrincipalAttachment(
      this,
      "DevicePrincipalAttachment",
      {
        principal: device_credentials.certificateArn,
        thingName: device.ref
      }
    );

    /**
     * Create Greengrass Lambdas.
     */

    const greengrass_group_lambda_role = new iam.Role(
      this,
      "GreengrassGroupLambdaRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com")
      }
    );

    greengrass_group_lambda_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSLambdaFullAccess")
    );

    greengrass_group_lambda_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("CloudWatchLogsFullAccess")
    );

    greengrass_group_lambda_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSIoTFullAccess")
    );

    greengrass_group_lambda_role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSGreengrassFullAccess")
    );

    const receiver_lambda = new lambda.Function(this, "ReceiverLambda", {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset(path.join(__dirname, "receiver-lambda")),
      handler: "receiver-lambda.handler",
      memorySize: 1024,
      role: greengrass_group_lambda_role,
      timeout: cdk.Duration.seconds(60)
    });

    const receiver_lambda_version = receiver_lambda.addVersion("1");

    const receiver_lambda_alias = new lambda.Alias(
      this,
      "ReceiverLambdaAlias",
      {
        aliasName: "ReceiverLambdaAlias",
        version: receiver_lambda_version
      }
    );

    const analyzer_lambda = new lambda.Function(this, "AnalyzerLambda", {
      runtime: lambda.Runtime.PYTHON_3_7,
      code: lambda.Code.fromAsset(path.join(__dirname, "analyzer-lambda")),
      handler: "analyzer-lambda.handler",
      memorySize: 1024,
      role: greengrass_group_lambda_role,
      timeout: cdk.Duration.seconds(60)
    });

    const analyzer_lambda_version = analyzer_lambda.addVersion(
      Guid.create().toString()
    );

    const analyzer_lambda_alias = new lambda.Alias(
      this,
      "AnalyzerLambdaAlias",
      {
        aliasName: "AnalyzerLambdaAlias",
        version: analyzer_lambda_version
      }
    );

    const function_definition = new greengrass.CfnFunctionDefinition(
      this,
      "FunctionDefinition",
      { name: "FunctionDefinition" }
    );

    const function_definition_version = new greengrass.CfnFunctionDefinitionVersion(
      this,
      "FunctionDefinitionVersion",
      {
        functionDefinitionId: function_definition.getAtt("Id").toString(),
        defaultConfig: {
          execution: {
            isolationMode: "NoContainer"
          }
        },
        functions: [
          {
            functionArn: receiver_lambda_alias.functionArn,
            id: Guid.create().toString(),
            functionConfiguration: {
              encodingType: "json",
              pinned: false,
              timeout: 30
            }
          },
          {
            functionArn: analyzer_lambda_alias.functionArn,
            id: Guid.create().toString(),
            functionConfiguration: {
              encodingType: "json",
              pinned: false,
              timeout: 30
            }
          }
        ]
      }
    );

    /**
     * Create Greengrass Loggers.
     */

    const logger_definition = new greengrass.CfnLoggerDefinition(
      this,
      "LoggerDefinition",
      {
        name: "LoggerDefinition"
      }
    );

    const logger_definition_version = new greengrass.CfnLoggerDefinitionVersion(
      this,
      "LoggerDefinitionVersion",
      {
        loggerDefinitionId: logger_definition.ref,
        loggers: [
          {
            component: "GreengrassSystem",
            id: "GreengrassSystem_Logger_CW_1",
            level: "INFO",
            type: "AWSCloudWatch"
          },
          {
            component: "Lambda",
            id: "Lambda_Logger_CW_1",
            level: "INFO",
            type: "AWSCloudWatch"
          },
          {
            component: "GreengrassSystem",
            id: "GreengrassSystem_Logger_Local_1",
            level: "DEBUG",
            space: 1024,
            type: "FileSystem"
          },
          {
            component: "Lambda",
            id: "Lambda_Logger_Local_1",
            level: "DEBUG",
            space: 1024,
            type: "FileSystem"
          }
        ]
      }
    );

    /**
     * Create Greengrass Subscriptions.
     */

    const subscription_definition = new greengrass.CfnSubscriptionDefinition(
      this,
      "SubscriptionDefinition",
      {
        name: "SubscriptionDefinition"
      }
    );

    const subscription_definition_version = new greengrass.CfnSubscriptionDefinitionVersion(
      this,
      "SubscriptionDefinitionVersion",
      {
        subscriptionDefinitionId: subscription_definition.ref,
        subscriptions: [
          {
            id: "DeviceToReceiver",
            source: `arn:aws:iot:${this.region}:${this.account}:thing/${device.thingName}`,
            subject: "metrics/raw/#",
            target: receiver_lambda_alias.functionArn
          },
          {
            id: "ReceiverToAnalyzer",
            source: receiver_lambda_alias.functionArn,
            subject: "metrics/stored/#",
            target: analyzer_lambda_alias.functionArn
          },
          {
            id: "AnalyzerToCloud",
            source: analyzer_lambda_alias.functionArn,
            subject: "metrics/filled/#",
            target: "cloud"
          },
          {
            id: "AnalyzerToDevice",
            source: analyzer_lambda_alias.functionArn,
            subject: "metrics/filled/#",
            target: `arn:aws:iot:${this.region}:${this.account}:thing/${device.thingName}`
          }
        ]
      }
    );

    /**
     * Create Greengrass Group.
     */

    const greengrass_group = new greengrass.CfnGroup(this, "GreengrassGroup", {
      name: "Greengrass-Group",
      roleArn: greengrass_service_role.roleArn
    });

    const greengrass_group_version = new greengrass.CfnGroupVersion(
      this,
      "GreengrassGroupVersion",
      {
        groupId: greengrass_group.ref,
        coreDefinitionVersionArn: core_definition_version.ref,
        deviceDefinitionVersionArn: device_definition_version.ref,
        subscriptionDefinitionVersionArn: subscription_definition_version.ref,
        loggerDefinitionVersionArn: logger_definition_version.ref,
        functionDefinitionVersionArn: function_definition_version.ref
      }
    );

    greengrass_group.addDependsOn(core_definition);
    greengrass_group.addDependsOn(device_definition);
    greengrass_group.addDependsOn(subscription_definition);
    greengrass_group.addDependsOn(logger_definition);
    greengrass_group.addDependsOn(function_definition);

    const vpc = ec2.Vpc.fromLookup(this, "VPC", {
      isDefault: true
    });

    const security_group = new ec2.SecurityGroup(this, "SecurityGroup", {
      vpc,
      description: "Allow ssh access to ec2 instances",
      allowAllOutbound: true
    });

    security_group.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow ssh access from the world"
    );

    security_group.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow http access from the world"
    );

    security_group.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow https access from the world"
    );

    security_group.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8883),
      "Allow MQTT access from the world"
    );

    const ubuntu = new ec2.GenericLinuxImage({
      "us-east-1": "ami-04763b3055de4860b",
      "us-west-2": "ami-0994c095691a46fb5"
    });

    const instance_type = ec2.InstanceType.of(
      ec2.InstanceClass.T3,
      ec2.InstanceSize.SMALL
    );

    const instance_role = new iam.Role(this, "Ec2InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com")
    });

    instance_role.addToPolicy(
      new iam.PolicyStatement({
        resources: [core_credentials.secretArn, device_credentials.secretArn],
        actions: [
          "secretsmanager:GetSecretValue",
          "secretsmanager:ListSecrets",
          "secretsmanager:DescribeSecret"
        ]
      })
    );

    instance_role.addToPolicy(
      new iam.PolicyStatement({
        resources: [
          greengrass_group.attrArn,
          `${greengrass_group.attrArn}/certificateauthorities/*`,
          `arn:aws:greengrass:${this.region}:${this.account}:/greengrass/things/${core.thingName}/connectivityInfo`
        ],
        actions: [
          "greengrass:ListGroupCertificateAuthorities",
          "greengrass:GetGroupCertificateAuthority",
          "greengrass:UpdateConnectivityInfo",
          "greengrass:CreateDeployment"
        ]
      })
    );

    const core_instance_user_data = ec2.UserData.forLinux({
      shebang: "#!/bin/bash -xe"
    });
    core_instance_user_data.addCommands(
      "exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1",
      "apt-get update -y",
      "adduser --system ggc_user",
      "groupadd --system ggc_group",
      "apt-get install jq software-properties-common redis-server nginx -y",
      "echo | add-apt-repository ppa:deadsnakes/ppa",
      "apt-get update -y",
      "apt-get install python3.7 -y",
      "update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.5 1",
      "update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.7 2",
      "echo | update-alternatives --config python3",
      "curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py",
      "python3 get-pip.py",
      "systemctl enable redis-server.service",
      "systemctl enable nginx",
      "printf 'y' | bash <(curl -Ss https://my-netdata.io/kickstart-static64.sh)",
      // "wget https://d1onfpft10uf5o.cloudfront.net/greengrass-core/downloads/1.9.3/greengrass-linux-x86-64-1.9.3.tar.gz",
      // "tar -xzf greengrass-linux-x86-64-1.9.3.tar.gz -C /",
      "wget https://d1onfpft10uf5o.cloudfront.net/greengrass-core/downloads/1.10.0/greengrass-linux-x86-64-1.10.0.tar.gz",
      "tar -xzf greengrass-linux-x86-64-1.10.0.tar.gz -C /",
      "pip3 install awscli pandas redis==3.3.4 greengrasssdk==1.5.0 --upgrade",
      cdk.Fn.sub("${command}", {
        command: `aws secretsmanager get-secret-value --secret-id Greengrass-Core-Credentials --region  ${this.region} | jq --raw-output '.SecretString' | jq -r '.[0].certificatePem' > /greengrass/certs/${core.thingName}.certificate.pem`
      }),
      cdk.Fn.sub("${command}", {
        command: `aws secretsmanager get-secret-value --secret-id Greengrass-Core-Credentials --region  ${this.region} | jq --raw-output '.SecretString' | jq -r '.[1].privateKey' > /greengrass/certs/${core.thingName}.private.key`
      }),
      cdk.Fn.sub("${command}", {
        command: `aws secretsmanager get-secret-value --secret-id Greengrass-Core-Credentials --region  ${this.region} | jq --raw-output '.SecretString' | jq -r '.[2].publicKey' > /greengrass/certs/${core.thingName}.public.key`
      }),
      "curl -o /greengrass/certs/root.ca.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem",
      "curl -o /etc/systemd/system/greengrass.service https://gist.githubusercontent.com/sudhirjena/281cb8e27705a0273e6d11dccac05a93/raw/fa2979a3f313fde4699450a94e41dc550c879aba/greengrass.service",
      "systemctl enable greengrass.service",
      "cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.disabled",
      "curl -o /etc/nginx/sites-available/default https://gist.githubusercontent.com/sudhirjena/95f0a7bf5f4c3e4100f11512416eae6c/raw/f08cac27d0811cf27e34dd338fa9685c80ed4a8e/netdata.proxy.conf",
      "service nginx reload",
      "cd /greengrass/config",
      cdk.Fn.sub("echo '${command}' | jq '.' > config.json", {
        command: `{"coreThing":{"caPath":"root.ca.pem","certPath":"${core.thingName}.certificate.pem","keyPath":"${core.thingName}.private.key","thingArn":"arn:aws:iot:${this.region}:${this.account}:thing/${core.thingName}","iotHost":"${core_credentials.iotEndpoint}","ggHost":"greengrass-ats.iot.${this.region}.amazonaws.com","keepAlive":600},"runtime":{"cgroup":{"useSystemd":"yes"}},"managedRespawn":false,"crypto":{"principals":{"SecretsManager":{"privateKeyPath":"file:///greengrass/certs/${core.thingName}.private.key"},"IoTCertificate":{"privateKeyPath":"file:///greengrass/certs/${core.thingName}.private.key","certificatePath":"file:///greengrass/certs/${core.thingName}.certificate.pem"}},"caPath":"file:///greengrass/certs/root.ca.pem"}}`
      }),
      "service greengrass start",
      "curl -o /tmp/userdata.sh http://169.254.169.254/latest/user-data"
    );

    const core_instance = new ec2.Instance(this, "GreengrassCoreInstance", {
      instanceType: instance_type,
      machineImage: ubuntu,
      vpc: vpc,
      securityGroup: security_group,
      instanceName: "Greengrass-Core-Instance",
      keyName: "ee-default-keypair",
      role: instance_role,
      userData: core_instance_user_data
    });

    const node_red_instance_user_data = ec2.UserData.forLinux({
      shebang: "#!/bin/bash -xe"
    });
    node_red_instance_user_data.addCommands(
      "exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1",
      "su ubuntu",
      "echo 'Installing pre-reqs' ",
      "sudo apt-get update -y",
      "curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -",
      "sudo apt-get install nodejs jq python3-pip nginx -y",
      "sudo systemctl enable nginx",
      "pip3 install awscli --upgrade",
      "sudo npm install pm2 -g",
      "sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu",
      "sudo npm install -g --unsafe-perm node-red@0.19.5",
      "su ubuntu -c 'pm2 start /usr/bin/node-red' ",
      "mkdir /home/ubuntu/.awscerts",
      cdk.Fn.sub("${command}", {
        command: `aws secretsmanager get-secret-value --secret-id Node-Red-Thing-Credentials --region  ${this.region} | jq --raw-output '.SecretString' | jq -r '.[0].certificatePem' > /home/ubuntu/.awscerts/${device.thingName}.cert.pem`
      }),
      cdk.Fn.sub("${command}", {
        command: `aws secretsmanager get-secret-value --secret-id Node-Red-Thing-Credentials --region  ${this.region} | jq --raw-output '.SecretString' | jq -r '.[1].privateKey' > /home/ubuntu/.awscerts/${device.thingName}.private.key`
      }),
      cdk.Fn.sub("${command}", {
        command: `aws secretsmanager get-secret-value --secret-id Node-Red-Thing-Credentials --region  ${this.region} | jq --raw-output '.SecretString' | jq -r '.[2].publicKey' > /home/ubuntu/.awscerts/${device.thingName}.public.key`
      }),
      cdk.Fn.sub("${command}", {
        command: `# CERTIFICATE_AUTHORITY_ID=$(aws greengrass list-group-certificate-authorities --group-id ${greengrass_group.attrId} --region  ${this.region} | jq -r '.GroupCertificateAuthorities[0].GroupCertificateAuthorityId')`
      }),
      cdk.Fn.sub("${command}", {
        command: `# aws greengrass get-group-certificate-authority --certificate-authority-id $CERTIFICATE_AUTHORITY_ID  --group-id ${greengrass_group.attrId} --region  ${this.region} | jq -r '.PemEncodedCertificate' > /home/ubuntu/.awscerts/group-CA.crt`
      }),
      cdk.Fn.sub("${command}", {
        command: `while [ ! -f /home/ubuntu/.node-red/settings.js ];
      do
        sleep 2;
      done;
      sleep 1;`
      }),
      "cd /home/ubuntu/.node-red",
      "mv settings.js settings.js.backup",
      "curl -o settings.js https://gist.githubusercontent.com/sudhirjena/501728beb60a3f00fc85feb9966b81b4/raw/120896c1eecf5a0560bdd79f8e7764e2fd6a8391/settings.js",
      "npm install node-red-contrib-mqtt-broker hub node-red-dashboard",
      cdk.Fn.sub("${command}", {
        command: `curl https://gist.githubusercontent.com/sudhirjena/2efacfdd980a43ea0e6267a75adef077/raw/99af57950b98ae85aab51f122553052ea2e1d14d/node-red-flow.json | jq '.[15].broker = "${core_instance.instancePrivateIp}" '> flows_$HOSTNAME.json`
      }),
      "cd /home/ubuntu",
      "chown -R ubuntu:ubuntu .awscerts",
      "su ubuntu -c 'pm2 restart node-red' ",
      "sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.disabled",
      "sudo curl -o /etc/nginx/sites-available/default https://gist.githubusercontent.com/sudhirjena/7bc0eb86fded30bb8bbff961de611553/raw/c2341cbb68dc28ea52735c254a3cd0e5e01329a2/node-red.proxy.conf",
      "sudo service nginx reload",
      "curl -o /tmp/userdata.sh http://169.254.169.254/latest/user-data"
    );

    const node_red_instance = new ec2.Instance(this, "NodeRedInstance", {
      instanceType: instance_type,
      machineImage: ubuntu,
      vpc: vpc,
      securityGroup: security_group,
      instanceName: "Node-Red-Instance",
      keyName: "ee-default-keypair",
      role: instance_role,
      userData: node_red_instance_user_data
    });

    new cdk.CfnOutput(this, "Region", {
      description: "The AWS Region you are operating in.",
      value: this.region
    });

    new cdk.CfnOutput(this, "Greengrass Group Id", {
      description: "Identifier for your Greengrass Group",
      value: greengrass_group.attrId
    });

    new cdk.CfnOutput(this, "Greengrass Core EC2 IP Address", {
      description: "The public Ip Address of your Greengrass Core EC2 Instance",
      value: core_instance.instancePublicIp
    });

    new cdk.CfnOutput(this, "Netdata URL", {
      description:
        "The URL of Netdata to monitor performance of your Greengrass Core",
      value: `http://${core_instance.instancePublicIp}/netdata/`
    });

    new cdk.CfnOutput(this, "NodeRed URL", {
      value: `http://${node_red_instance.instancePublicIp}/node-red`
    });

    new cdk.CfnOutput(this, "NodeRed Dashboard URL", {
      value: `http://${node_red_instance.instancePublicIp}/node-red/ui`
    });
  }
}
