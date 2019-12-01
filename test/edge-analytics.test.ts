import {
  expect as expectCDK,
  matchTemplate,
  MatchStyle
} from "@aws-cdk/assert";
import cdk = require("@aws-cdk/core");
import EdgeAnalytics = require("../lib/edge-analytics-stack");

test("Empty Stack", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new EdgeAnalytics.EdgeAnalyticsStack(app, "MyTestStack");
  // THEN
  expectCDK(stack).to(
    matchTemplate(
      {
        Resources: {}
      },
      MatchStyle.EXACT
    )
  );
});
