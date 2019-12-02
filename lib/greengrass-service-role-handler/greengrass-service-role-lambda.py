#  Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
#
#  Permission is hereby granted, free of charge, to any person obtaining a copy of
#  this software and associated documentation files (the "Software"), to deal in
#  the Software without restriction, including without limitation the rights to
#  use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
#  the Software, and to permit persons to whom the Software is furnished to do so.
#
#  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
#  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
#  FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
#  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
#  IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
#  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import sys
import cfnresponse
import boto3
from botocore.exceptions import ClientError
import json
import logging as log


def handler(event, context):

    log.getLogger().setLevel(log.INFO)
    responseData = {}

    try:
        log.info('Received event: {}'.format(json.dumps(event)))
        result = cfnresponse.FAILED
        greengrass = boto3.client('greengrass')

        roleArn = event['ResourceProperties']['RoleArn']

        if event['RequestType'] == 'Create':
            response = greengrass.associate_service_role_to_account(
                RoleArn=roleArn
            )
            associatedAt = response['AssociatedAt']

            responseData['AssociatedAt'] = associatedAt
            result = cfnresponse.SUCCESS
        elif event['RequestType'] == 'Update':
            log.info('Nothing to update: %s' % roleArn)
            result = cfnresponse.SUCCESS
        elif event['RequestType'] == 'Delete':
            response = greengrass.disassociate_service_role_from_account()
            disassociatedAt = response['DisassociatedAt']
            responseData['DisassociatedAt'] = disassociatedAt
            result = cfnresponse.SUCCESS
    except ClientError as e:
        log.error('Error: {}'.format(e))
        result = cfnresponse.FAILED

    log.info('Returning response of: {}, with result of: {}'.format(
        result, responseData))
    sys.stdout.flush()
    cfnresponse.send(event, context, result, responseData,
                     physicalResourceId=roleArn)
