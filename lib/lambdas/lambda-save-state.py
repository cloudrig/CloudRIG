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

	instance_id = event['detail']['instance-id']
	logger.info(f"Handling stop event for instance: {instance_id}")

	spotfleet_id = os.environ['CLOUDRIG_SPOTFLEET_REQUEST_ID']

	logger.info(f"Listing the instances managed by this stack spotfleet {spotfleet_id}...")
	spotfleet_instances = ec2.describe_spot_fleet_instances(SpotFleetRequestId=spotfleet_id)

	#logger.info(f"Checking if the instance {instance_id} is in this list...")
	#is_instance_in_this_stack = False
	#for instance in spotfleet_instances['ActiveInstances']:
	#	if instance['InstanceId'] == instance_id:
	#		is_instance_in_this_stack = True
	is_instance_in_this_stack = True

	if is_instance_in_this_stack:
		logger.info("Triggering the state save automation...")
		ssm.start_automation_execution(DocumentName=os.environ['CLOUDRIG_SAVE_STATE_AUTOMATION_DOCUMENT_NAME'], Parameters={'InstanceId': [instance_id]})
		logger.info('Done starting the save state automation')
	else:
		logger.info(f'Instance {instance_id} is not part of this stack. Ignoring...')
