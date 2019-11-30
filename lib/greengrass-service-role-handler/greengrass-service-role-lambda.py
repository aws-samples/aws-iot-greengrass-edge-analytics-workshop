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
