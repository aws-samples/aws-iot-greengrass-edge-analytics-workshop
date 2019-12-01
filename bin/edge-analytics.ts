#!/usr/bin/env node
import "source-map-support/register";
import cdk = require("@aws-cdk/core");
import { EdgeAnalyticsStack } from "../lib/edge-analytics-stack";

const app = new cdk.App();
new EdgeAnalyticsStack(app, "EdgeAnalyticsStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
});
app.synth();
