var AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {

	console.log("Triggered");
	console.log(event);
	console.log(context);

	var ec2 = new AWS.EC2();
	var cloudwatchevents = new AWS.CloudWatchEvents();
	var lambda = new AWS.Lambda();
	var amiId = event.ImageId;

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

	function series(arr, cb) {
		function process(arr, cb, err) {
			if(err) { cb(err); return; }
			if(arr.length === 0) { cb(null); return; }
			arr.shift().call(null, process.bind(null, arr, cb))
		}
		process(arr, cb)
	}

	waterfall([

		function (cb) {
			ec2.describeImages({
				ImageIds: [amiId]
			}, cb)
		},

		function (data, cb) {
			if (data.Images.length === 0) {
				console.log("Image does not exists. Error...");
				throw "Image does not exists. Error..."
			} else {
				const imageState = data.Images[0].State;
				if (imageState === "available") {
					console.log("Image is " + amiId + " is ready. Updating the CloudFormation...");
					cb();
				} else {
					console.log('An error occurred while creating the image ' + amiId + ' (state = ' + imageState + ') ')
				}
			}
		},

		function (data, cb) {
			console.log("Tagging the image " + amiId + " and the associated snapshots...");

			const resourcesToTag = [];
			resourcesToTag.push(amiId);
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
					Key: "cloudrig:cloudformation:stackname",
					Value: process.env.CLOUDRIG_CLOUDFORMATION_STACK_NAME
				}]
			}, cb)
		},

		function (data, cb) {
			console.log("Fetching the current CloudFormation parameters...");
			cloudformation.describeStacks({
				StackName: process.env.CLOUDRIG_CLOUDFORMATION_STACK_NAME
			}, cb)
		},
		function (data, cb) {
			console.log("Update the stack parameters with the new AMI Id...");
			const cloudformationParameters = data.Stacks[0].Parameters;
			for (i = 0; i < cloudformationParameters.length; i++) {
				// Set all the parameters to use previous value
				parameter = cloudformationParameters[i];

				// If the parameter is the Image ID, we replace its value
				if (parameter.get('ParameterKey') === 'InstanceAMIId') {
					parameter.set('ParameterKey', amiId);
				} else {
					parameter.delete('ParameterValue');
					parameter.set('UsePreviousValue', true);
				}
			}

			cloudformation.updateStack({
				StackName: process.env.CLOUDRIG_CLOUDFORMATION_STACK_NAME,
				UsePreviousTemplate: true,
				Capabilities: ['CAPABILITY_IAM'],
				Parameters: cloudformationParameters
			}, cb);
		},

		function (cb) {
			ec2.describeImages({
				Filters: [{
					Name: 'tag:cloudrig',
					Values: ['true']
				},{
					Name: 'tag:cloudrig:cloudformation:stackname',
					Values: [process.env.CLOUDRIG_CLOUDFORMATION_STACK_NAME]
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

	], function(err) {
		if (err) { console.log(err); callback(err); return; }
		console.log("Done");
		callback();
	});
};
