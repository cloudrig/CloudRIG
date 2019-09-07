import json
import boto3
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ec2 = boto3.client('ec2')
ssm = boto3.client('ssm')

def handler(event, context):
	logger.info("Save state lambda triggered")
	logger.info('Event: ' + json.dumps(event))
	logger.info('Context: ' + json.dumps(context))

	instance_id = event['detail']['instance-id']
	logger.info(f"Handling stop event for instance: {instanceId}")

	spotfleet_id = os.env['CLOUDRIG_SPOTFLEET_REQUEST_ID']

	logger.info(f"Listing the instances managed by this stack spotfleet {spotfleet_id}...")
	spotfleet_instances = ec2.describeSpotFleetInstances(SpotFleetRequestId=)

	logger.info("Checking if the instance " + instanceId + " is in this list...")
	is_instance_in_this_stack = False
	for instance in data['ActiveInstances']:
		if instance['InstanceId'] == instance_id:
			is_instance_in_this_stack = True

	if is_instance_in_this_stack:
		logger.info("Triggering the state save automation...")
		ssm.start_automation_execution(DocumentName=os.env['CLOUDRIG_SAVE_STATE_AUTOMATION_DOCUMENT_NAME'], Parameters={'InstanceId': [instance_id]})
		logger.info('Done starting the save state automation')
	else:
		logger.info(f'Instance {instanceId} is not part of this stack. Ignoring...')
