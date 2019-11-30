"""
Receiver Lambda.

- Receives MQTT message from device.
- Parses MQTT message topic and payload (containing metrics).
- Stores metrics in local datastore (redis)
- Publishes dataset to downstream handlers over MQTT.
"""

import json
import logging as log
import time
import redis

import greengrasssdk

# Initialize redis connection
pool = redis.ConnectionPool(
    host='localhost', port=6379, db=0, decode_responses=True)
conn = redis.StrictRedis(connection_pool=pool)

ggdevice_client = greengrasssdk.client('iot-data')


def handler(event, context):
    log.getLogger().setLevel(log.INFO)
    global aws_request_id

    aws_request_id = context.aws_request_id
    topic = context.client_context.custom['subject']

    log.info('Received message from topic: {0} with payload:\n {1}'.format(
        topic, json.dumps(event, indent=4)))

    deviceId = topic.split('/')[-1]
    metrics = event
    key_prefix = deviceId

    metrics['timestamp'] = int(metrics['timestamp'])
    end_time = int(time.time())
    start_time = end_time - 3600

    store_metrics(key_prefix, metrics, start_time)
    topic = 'metrics/stored/{}'.format(deviceId)
    message = {'upstream-request-id': aws_request_id}
    callDownstreamLambda(topic, message)


def store_metrics(key_prefix, metrics, start_time):
    pipe = conn.pipeline(True)
    key = '{0}:{1}'.format(key_prefix, metrics['timestamp'])
    pipe.hmset(key, metrics)
    pipe.expire(key, 3600)
    pipe.zadd(key_prefix, {metrics['timestamp']: metrics['timestamp']})
    pipe.zremrangebyscore(key_prefix, 0, start_time - 1)
    pipe.execute()


def callDownstreamLambda(topic, message):
    log.info(
        'Publishing message to the next lambda for further processing over topic: {0} \n {1}'
        .format(topic, json.dumps(message, indent=2)))
    ggdevice_client.publish(topic=topic, payload=json.dumps(message))
