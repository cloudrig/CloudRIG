var AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {

	console.log("Orgchestration lambda triggered");
	console.log(event);
	console.log(context);

	var ec2 = new AWS.EC2();
	var cloudwatchevents = new AWS.CloudWatchEvents();
	var lambda = new AWS.Lambda();
	var cloudformation = new AWS.CloudFormation();
	var ImageId;
	var RuleArn;

	function waterfall(arr, cb) {
		function process(arr, cb, err, data) {
			if (err) { cb(err); return; }
			if (arr.length === 0) { cb(null, data); return; }
			var forwardArgs = [process.bind(null, arr, cb)];
			if (data) { forwardArgs.unshift(data) }
			arr.shift().apply(null, forwardArgs)
		}
		process(arr, cb)
	}

	function newImage() {
		var instanceId = event.detail["instance-id"];
		waterfall([
			function (cb) {
				console.log("Listing the instances managed by this stack spotfleet...");
				ec2.describeSpotFleetInstances({
					SpotFleetRequestId: instanceId,
				}, cb)
			},

			function (cb) {
				console.log("Checking if the instance " + instanceId + " is in this list...");
				var isInstanceInThisStack = false;
				for (var instance in cb.ActiveInstances) {
					if (instance.InstanceId === instanceId) {
						isInstanceInThisStack = true;
					}
				}

				if (isInstanceInThisStack) {
					cb();
				} else {
					console.log('Instance ' + instanceId + ' is not part of this stack. Ignoring...');
				}
			},

			function (data, cb) {
				console.log("Set the EC2 SpotFleet target capacity to 0...");
				ec2.modifySpotFleetRequest({
					SpotFleetRequestId: process.env.CLOUDRIG_SPOTFLEET_REQUEST_ID,
					TargetCapacity: 0
				}, cb)
			},

			function (cb) {
				console.log("Create new AMI for instance with id " + instanceId);
				ec2.createImage({
					InstanceId: instanceId,
					Name: 'cloudrig-' + new Date().getTime()
				}, cb)
			},
			function (data, cb) {
				console.log("Tagging the image " + data.ImageId + " and the associated snapshots...");

				const resourcesToTag = [];
				resourcesToTag.push(data.ImageId);
				data.BlockDeviceMappings.forEach(function(device) {
					if (device.Ebs && device.Ebs.SnapshotId) {
						resourcesToTag.push(device.Ebs.SnapshotId);
					}
				});

				ec2.createTags({
					Resources: resourcesToTag,
					Tags: [{
						Key: "cloudrig",
						Value: "true"
					},{
						Key: "cloudrig:cloudformation:stackid",
						Value: "${AWS::StackId}"
					}]
				}, cb)
			},

			function (cb) {
				console.log("Terminating the instance " + instanceId);
				ec2.terminateInstances({
					InstanceIds: [instanceId]
				}, cb)
			},

			function (data, cb) {
				console.log("Enabling the save CloudWatch rule...");
				cloudwatchevents.enableRule({
					Name: "cloudrig-save",
				}, cb)
			}
		], function (err, data) {
			if (err) { console.log(err); callback(err); }
			callback();
		});
	}
	waterfall([
			function (cb) {
				ec2.describeImages({
					Filters: [{
						Name: 'tag:cloudrig',
						Values: ['true']
					},{
						Name: 'tag:cloudrig:cloudformation:stackid',
						Values: ['${AWS::StackId}']
					}]
				}, cb)
			},
			function (data, cb) {
				if (data.Images.length > 0) {
					const imageIdToDeregister = data.Images[0].ImageId;
					console.log("Deregister previous image " + imageIdToDeregister + "...");
					ec2.deregisterImage({
						ImageId: imageIdToDeregister
					}, function (err, newData) {
						if (err) cb(err);
						else cb(null, data);
					})
				}
				else cb(null, data);
			},
			function (data, cb) {
				if (data.Images.length > 0 && data.Images[0].BlockDeviceMappings.length > 0) {
					const snapshotIdToDeregister = data.Images[0].BlockDeviceMappings[0].Ebs.SnapshotId;
					console.log("Delete previous snapshot " + snapshotIdToDeregister + "...");
					ec2.deleteSnapshot({ SnapshotId: snapshotIdToDeregister }, cb);
				}
				else cb(null);
			}
		],
		function (err, data) {
			if (err) { console.log(err); callback(err); }
			newImage();
		});
};
