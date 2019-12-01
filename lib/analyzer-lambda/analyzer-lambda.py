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

"""
Analyzer Lambda.

- Receives MQTT message from upstream.
- Populates gap filled time-series metrics.
- Calculates rolling MEAN and STANDARD DEVIATION
- Publishes dataset to downstream handlers over MQTT.
"""

import json
import logging as log
import time
import redis
import pandas as pd
import numpy as numpy

import greengrasssdk

# Initialize redis connection
pool = redis.ConnectionPool(
    host='localhost', port=6379, db=0, decode_responses=True)
conn = redis.StrictRedis(connection_pool=pool)

ggdevice_client = greengrasssdk.client('iot-data')
pd.options.mode.chained_assignment = None


def handler(event, context):
    log.getLogger().setLevel(log.INFO)
    global aws_request_id

    aws_request_id = event['upstream-request-id']
    topic = context.client_context.custom['subject']

    log.info('Received message from topic: {0} with payload:\n {1}'.format(
        topic, json.dumps(event, indent=4)))

    log.info('The upstream request id is: {}'.format(aws_request_id))

    deviceId = topic.split('/')[-1]
    key_prefix = deviceId

    metrics_list = ['timestamp', 'temperature', 'pressure', 'humidity']

    end_time = int(time.time())
    start_time = end_time - 3600

    calculated_offset = str(end_time - int(end_time / 10) * 10) + 'S'
    min_resolution_seconds = 10

    redis_results = select_metrics(
        key_prefix, aws_request_id, metrics_list, start_time)

    metrics = [redis_results[i * len(metrics_list):(i + 1) * len(metrics_list)]
               for i in range((len(redis_results) + len(metrics_list) - 1) // len(metrics_list))]

    raw_df = pd.DataFrame(metrics, columns=metrics_list).set_index('timestamp')
    raw_df = raw_df.apply(pd.to_numeric)
    raw_df.index = pd.to_datetime(raw_df.index, unit='s')

    # Code exercise for filling missing metrics...
    # --------------Enter code below this line--------------

    # ----------------------------------------------------------

    # Code exercise for rolling statistical calculation...
    # --------------Enter code below this line--------------

    # ----------------------------------------------------------

    topic = 'metrics/filled/{}'.format(deviceId)
    message = json.loads(raw_df.to_json(orient='columns'))
    callDownstreamLambda(topic, message)


def select_metrics(key_prefix, unique_id, metrics_list, start_time):
    pipe = conn.pipeline(True)
    pipe.zremrangebyscore(key_prefix, 0, start_time - 1)
    destination = 'tmp:{}'.format(unique_id)
    pipe.zunionstore(destination, [key_prefix], aggregate=None)
    pipe.sort(destination, by=key_prefix + ':*->timestamp_loc', get=[
        key_prefix + ':*->' + metric_name
        for metric_name in metrics_list
    ])
    pipe.delete(destination)
    redis_results = pipe.execute()
    return redis_results[len(redis_results) - 2]


def get_source_dataframe(end_time, frequency):
    time_window_start = pd.to_datetime(end_time - 3600, unit='s')
    time_window_end = pd.to_datetime(end_time, unit='s')
    time_window = pd.date_range(
        start=time_window_start, end=time_window_end, freq=frequency)
    source_df = pd.DataFrame(index=time_window)
    source_df.index.name = 'timestamp'
    return source_df


def callDownstreamLambda(topic, message):
    log.info(
        'Publishing message to the next lambda for further processing over topic: {0} \n {1}'
        .format(topic, json.dumps(message, indent=2)))
    ggdevice_client.publish(topic=topic, payload=json.dumps(message))
