import json
import boto3
import os
import logging
import time

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ec2 = boto3.client('ec2')
cloudformation = boto3.client('cloudformation')


def get_image_description(ami_id):
	amis = ec2.describe_images(ImageIds=[ami_id])['Images']
	ami_description = None
	if amis:
		ami_description = amis[0]

	if not ami_description:
		raise Exception(f'Could not find image {ami_id}. Aborting...')

	return ami_description


def tag_image_and_snapshots(ami_id, ami_description):
	# Listing the snapshots and tag them
	resources_to_tag = []
	resources_to_tag.append(ami_id)
	for mapping in ami_description['BlockDeviceMappings']:
		if 'Ebs' in mapping.keys() and 'SnapshotId' in mapping['Ebs'].keys():
			resources_to_tag.append(mapping['Ebs']['SnapshotId'])

	# Tag the resources
	ec2.create_tags(Resources=resources_to_tag, Tags=[
		{
			'Key': "cloudrig",
			'Value': "true"
		},
		{
			'Key': "cloudrig:cloudformation:stackname",
			'Value': os.environ['CLOUDRIG_CLOUDFORMATION_STACK_NAME']
		}
	])


def get_stack_description():
	# Get the current stack parameters
	stack_name = os.environ['CLOUDRIG_CLOUDFORMATION_STACK_NAME']
	paginator = cloudformation.get_paginator('describe_stacks')
	pages = paginator.paginate(StackName=stack_name)
	cloudformation_stack = None
	for page in pages:
		if page['Stacks']:
			cloudformation_stack = page['Stacks'][0]

	if not cloudformation_stack:
		raise Exception(f'Could not find the cloudformation stack {stack_name}')

	return cloudformation_stack


def update_cloudformation_with_new_ami(ami_id):
	logger.info(f'Updating the CloudFormation parameters with the new AMI {ami_id}...')

	cloudformation_stack = get_stack_description()

	# Update the parameters
	new_parameters = cloudformation_stack['Parameters']
	for parameter in new_parameters:
		if parameter.get('ParameterKey') == 'InstanceAMIId':
			parameter['ParameterValue'] = ami_id
		else:
			del parameter['ParameterValue']
			parameter['UsePreviousValue'] = True

	# Update the stack
	stack_name = os.environ['CLOUDRIG_CLOUDFORMATION_STACK_NAME']
	cloudformation.update_stack(StackName=stack_name, UsePreviousTemplate=True, Parameters=new_parameters, Capabilities=['CAPABILITY_IAM'])

	# Check the operation result and raise an error is the CloudFormation is in invalid state
	is_stack_updating = True
	while is_stack_updating:
		cloudformation_stack = get_stack_description()
		# Wait for the update to be completed. We do not wait during the CLEANUP.
		if 'UPDATE_COMPLETE' in cloudformation_stack['StackStatus']:
			is_stack_updating = False

		if 'UPDATE_FAILED' in cloudformation_stack['StackStatus'] or 'IN_PROGRESS' not in cloudformation_stack['StackStatus']:
			raise Exception(f'CloudFormation stack update has failed (state = {cloudformation_stack["StackStatus"]}). Previous AMIs will not be deregistered.')

		else:
			# Sleep 5 seconds before checking again
			time.sleep(5)


def deregister_previous_image(new_ami_id):
	amis = ec2.describe_images(Filters=[
		{
			'Name': 'tag:cloudrig',
			'Values': ['true']
		},
		{
			'Name': 'tag:cloudrig:cloudformation:stackname',
			'Values': [os.environ['CLOUDRIG_CLOUDFORMATION_STACK_NAME']]
		}
	])['Images']

	amis_ids_to_deregister = []
	for ami in amis:
		if ami['ImageId'] != new_ami_id:
			amis_ids_to_deregister.append(ami['ImageId'])

	if not amis_ids_to_deregister:
		logger.info('No image to deregister.')
		return

	# Deregister the images
	logger.info(f'Deregistering the previous AMIs {json.dumps(amis_ids_to_deregister)}...')
	for ami_id_to_deregister in amis_ids_to_deregister:
		ami_to_deregister = ec2.deregister_image(ImageId=ami_id_to_deregister)

		# Delete the associated snapshots
		for mapping in ami_to_deregister['BlockDeviceMappings']:
			if 'Ebs' in mapping.keys() and 'SnapshotId' in mapping['Ebs'].keys():
				snapshot_id = mapping['SnapshotId']
				logger.info(f'Deleting the previous AMI snapshot {snapshot_id}...')
				ec2.delete_snapshot(SnapshotId=snapshot_id)


def handler(event, context):
	logger.info("Save state lambda triggered")
	logger.info('Event: ' + json.dumps(event))

	ami_id = event['ImageId']

	logger.info(f"Handling image creation finished for AMI: {ami_id}")

	# Fetch the AMI description
	ami = get_image_description(ami_id)

	# Check the status of the image creation
	if ami['State'] != 'available':
		raise Exception(f'Image {ami_id} creation failed. Aborting...')

	# Tag the AMI and the snapshots
	tag_image_and_snapshots(ami_id, ami)

	# Update the CloudFormation stack with the new AMI Id
	update_cloudformation_with_new_ami(ami_id)

	# Deregister the previous image
	deregister_previous_image(ami_id)

	logger.info(f'Done handling the AMI {ami_id} creation process')
